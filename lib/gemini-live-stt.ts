import WebSocket from "ws";
import { BaseSTTStream, type STTPlugin, type STTStream, type STTStreamOptions } from "@dtelecom/agents-js";
import { geminiTranscribeAudio, normalizeSttText, pcm16ToWav } from "./gemini";

const SAMPLE_RATE = 16000;
const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const PING_MS = 20_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;
const SETUP_TIMEOUT_MS = 8000;
const FALLBACK_FLUSH_MS = 2500;

const LIVE_MODELS = [
  "models/gemini-3.8-live",
  "models/gemini-2.5-flash-native-audio-latest",
  "models/gemini-2.0-flash-live-001",
  "models/gemini-live-2.5-flash-preview",
];

export type GeminiLiveSTTOptions = {
  apiKey: string;
  language?: string;
  /** When false, the caller drives activityStart/activityEnd (our VAD). */
  automaticActivityDetection?: boolean;
  prefixPaddingMs?: number;
  silenceDurationMs?: number;
};

type LiveServerMessage = {
  setupComplete?: Record<string, unknown>;
  error?: { code?: number; message?: string; status?: string };
  goAway?: { timeLeft?: string };
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
  serverContent?: {
    turnComplete?: boolean;
    generationComplete?: boolean;
    interrupted?: boolean;
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ text?: string; thought?: boolean }> };
  };
};

function mergeTranscript(prev: string, next: string): string {
  const left = (prev || "").trim();
  const right = (next || "").trim();
  if (!left) return right;
  if (!right) return left;
  if (right.startsWith(left)) return right;
  if (left.startsWith(right)) return left;
  if (left.endsWith(right)) return left;
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

function transcribeInstruction(language?: string): string {
  const languageRule =
    language && language !== "Auto"
      ? `Prefer transcribing in ${language}.`
      : "Automatically detect the spoken language. Use native script (never romanize Bengali or Hindi).";
  return [
    "You are a silent meeting transcription engine.",
    "Transcribe the user's speech into text.",
    "Return only the spoken words.",
    "Never converse, greet, ask questions, or describe the audio.",
    "If there is no speech, return nothing.",
    languageRule,
  ].join(" ");
}

function buildSetup(model: string, options: GeminiLiveSTTOptions, resumeHandle?: string) {
  const automatic = options.automaticActivityDetection !== false;
  return {
    setup: {
      model,
      responseModalities: ["AUDIO"],
      generationConfig: { responseModalities: ["AUDIO"] },
      systemInstruction: { parts: [{ text: transcribeInstruction(options.language) }] },
      inputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: automatic
          ? {
              disabled: false,
              startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
              endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
              prefixPaddingMs: options.prefixPaddingMs ?? 300,
              silenceDurationMs: options.silenceDurationMs ?? 700,
            }
          : { disabled: true },
      },
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    },
  };
}

/**
 * Persistent Gemini Live WebSocket STT.
 * sendAudio() never awaits the network. Silence must not close the session.
 */
export class GeminiLiveSTTStream extends BaseSTTStream {
  private ws: WebSocket | null = null;
  private closed = false;
  private ready = false;
  private modelIndex = 0;
  private resumeHandle: string | undefined;
  private pendingAudio: Buffer[] = [];
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private setupTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private utterance = Buffer.alloc(0);
  private liveText = "";
  private inUtterance = false;
  private finalEmitted = false;
  private pendingActivityStart = false;
  private pendingActivityEnd = false;

  constructor(private readonly options: GeminiLiveSTTOptions) {
    super();
    this.connect();
  }

  get connected(): boolean {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  sendAudio(pcm16: Buffer): void {
    if (this.closed || !pcm16.length) return;
    this.utterance = Buffer.concat([this.utterance, pcm16]);
    if (this.utterance.length > SAMPLE_RATE * 2 * 30) {
      this.utterance = this.utterance.subarray(this.utterance.length - SAMPLE_RATE * 2 * 30);
    }
    this.transmit(pcm16);
  }

  beginUtterance(): void {
    if (this.closed) return;
    this.inUtterance = true;
    this.liveText = "";
    this.utterance = Buffer.alloc(0);
    this.finalEmitted = false;
    this.clearFallbackTimer();
    if (this.options.automaticActivityDetection === false) {
      this.sendControl({ realtimeInput: { activityStart: {} } }, "start");
    }
  }

  endUtterance(): void {
    if (this.closed || !this.inUtterance) return;
    this.inUtterance = false;
    if (this.options.automaticActivityDetection === false) {
      this.sendControl({ realtimeInput: { activityEnd: {} } }, "end");
    } else {
      this.sendControl({ realtimeInput: { audioStreamEnd: true } }, "end");
    }
    this.armFallback();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.clearTimers();
    this.pendingAudio = [];
    try {
      this.ws?.close();
    } catch {
      // Ignore close races.
    }
    this.ws = null;
  }

  private connect(): void {
    if (this.closed) return;
    this.ready = false;
    this.teardownSocket();

    const model = LIVE_MODELS[Math.min(this.modelIndex, LIVE_MODELS.length - 1)];
    const url = `${WS_URL}?key=${encodeURIComponent(this.options.apiKey)}`;
    console.log("[STT] Gemini Live connecting", { model });

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { perMessageDeflate: false });
    } catch (error) {
      console.warn("[STT] Gemini Live construct failed; retrying", error);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    this.setupTimer = setTimeout(() => {
      if (this.ready || this.closed) return;
      console.warn("[STT] Gemini Live setup timed out", { model });
      this.advanceModelAndReconnect();
    }, SETUP_TIMEOUT_MS);

    ws.on("open", () => {
      if (this.ws !== ws || this.closed) return;
      this.sendJson(buildSetup(model, this.options, this.resumeHandle));
    });

    ws.on("message", (data) => {
      if (this.ws !== ws || this.closed) return;
      this.handleMessage(data);
    });

    ws.on("error", (err) => {
      console.warn("[STT] Gemini Live socket error", err instanceof Error ? err.message : err);
    });

    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      this.ready = false;
      this.stopPing();
      this.clearSetupTimer();
      if (this.closed) return;
      console.warn("[STT] Gemini Live closed; reconnecting (session stays logically open)", {
        code,
        reason: reason.toString(),
      });
      this.scheduleReconnect();
    });
  }

  private handleMessage(raw: unknown): void {
    let msg: LiveServerMessage;
    try {
      let text = "";
      if (typeof raw === "string") text = raw;
      else if (Buffer.isBuffer(raw)) text = raw.toString("utf8");
      else if (Array.isArray(raw)) text = Buffer.concat(raw).toString("utf8");
      else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString("utf8");
      else return;
      msg = JSON.parse(text) as LiveServerMessage;
    } catch {
      return;
    }

    if (msg.error) {
      const message = msg.error.message || msg.error.status || "Gemini Live error";
      console.warn("[STT] Gemini Live error", message);
      if (/not found|not supported|invalid model|not available/i.test(message)) {
        this.advanceModelAndReconnect();
        return;
      }
      this.emit("error", new Error(message));
      return;
    }

    if (msg.setupComplete) {
      this.clearSetupTimer();
      this.ready = true;
      this.reconnectAttempt = 0;
      console.log("[STT] Gemini Live session ready", {
        model: LIVE_MODELS[Math.min(this.modelIndex, LIVE_MODELS.length - 1)],
      });
      this.flushPending();
      this.startPing();
      return;
    }

    if (msg.sessionResumptionUpdate?.newHandle && msg.sessionResumptionUpdate.resumable !== false) {
      this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    }

    if (msg.goAway) {
      console.log("[STT] Gemini Live goAway; rotating connection without dropping session", msg.goAway);
      this.scheduleReconnect(50);
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    const input = normalizeSttText(content.inputTranscription?.text || "");
    if (input) {
      this.liveText = mergeTranscript(this.liveText, input);
      this.emit("transcription", { text: this.liveText, isFinal: false });
    }

    if (!this.liveText) {
      const modelText = normalizeSttText(
        (content.modelTurn?.parts || [])
          .filter((part) => part && part.thought !== true && typeof part.text === "string")
          .map((part) => part.text || "")
          .join(" ")
      );
      if (modelText) {
        this.liveText = mergeTranscript(this.liveText, modelText);
        this.emit("transcription", { text: this.liveText, isFinal: false });
      }
    }

    const finished = content.inputTranscription?.finished === true || content.turnComplete === true || content.generationComplete === true;
    if (finished) {
      this.flushFinal();
    }
  }

  private flushFinal(): void {
    this.clearFallbackTimer();
    const text = normalizeSttText(this.liveText);
    this.liveText = "";
    this.utterance = Buffer.alloc(0);
    if (!text || this.finalEmitted) return;
    this.finalEmitted = true;
    this.emit("transcription", { text, isFinal: true });
  }

  private armFallback(): void {
    this.clearFallbackTimer();
    const snapshot = this.utterance;
    this.fallbackTimer = setTimeout(() => {
      void this.runHttpFallback(snapshot);
    }, FALLBACK_FLUSH_MS);
  }

  private async runHttpFallback(pcm: Buffer): Promise<void> {
    if (this.closed || this.finalEmitted) return;
    if (this.liveText) {
      this.flushFinal();
      return;
    }
    if (!pcm.length) return;
    try {
      const text = normalizeSttText(
        await geminiTranscribeAudio(this.options.apiKey, pcm16ToWav(pcm, SAMPLE_RATE), this.options.language)
      );
      if (!text || this.closed || this.finalEmitted) return;
      this.utterance = Buffer.alloc(0);
      this.finalEmitted = true;
      this.emit("transcription", { text, isFinal: true });
    } catch (error) {
      console.warn("[STT] HTTP fallback transcription failed", error);
    }
  }

  private transmit(pcm16: Buffer): void {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) {
      this.pendingAudio.push(pcm16);
      if (this.pendingAudio.length > 400) {
        this.pendingAudio = this.pendingAudio.slice(-200);
      }
      return;
    }
    this.sendJson({
      realtimeInput: {
        audio: {
          data: pcm16.toString("base64"),
          mimeType: `audio/pcm;rate=${SAMPLE_RATE}`,
        },
      },
    });
  }

  private sendControl(payload: unknown, kind: "start" | "end"): void {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) {
      if (kind === "start") {
        this.pendingActivityStart = true;
        this.pendingActivityEnd = false;
      } else {
        this.pendingActivityEnd = true;
      }
      return;
    }
    this.sendJson(payload);
  }

  private flushPending(): void {
    if (!this.connected) return;
    if (this.pendingActivityStart) {
      this.sendJson({ realtimeInput: { activityStart: {} } });
      this.pendingActivityStart = false;
    }
    const queued = this.pendingAudio;
    this.pendingAudio = [];
    for (const chunk of queued) {
      this.transmit(chunk);
    }
    if (this.pendingActivityEnd) {
      if (this.options.automaticActivityDetection === false) {
        this.sendJson({ realtimeInput: { activityEnd: {} } });
      } else {
        this.sendJson({ realtimeInput: { audioStreamEnd: true } });
      }
      this.pendingActivityEnd = false;
    }
  }

  private sendJson(payload: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (error) {
      console.warn("[STT] Gemini Live send failed", error);
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
        } catch {
          // Ping failure is recovered by the close/reconnect path.
        }
      }
    }, PING_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(delayMs?: number): void {
    if (this.closed || this.reconnectTimer) return;
    const wait = delayMs ?? Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect();
    }, wait);
  }

  private advanceModelAndReconnect(): void {
    this.teardownSocket();
    if (this.modelIndex < LIVE_MODELS.length - 1) {
      this.modelIndex += 1;
      this.resumeHandle = undefined;
    }
    this.scheduleReconnect(300);
  }

  private teardownSocket(): void {
    this.ready = false;
    this.stopPing();
    this.clearSetupTimer();
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.removeAllListeners();
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch {
      // Ignore.
    }
  }

  private clearSetupTimer(): void {
    if (this.setupTimer) {
      clearTimeout(this.setupTimer);
      this.setupTimer = null;
    }
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopPing();
    this.clearSetupTimer();
    this.clearFallbackTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export class GeminiLiveSTT implements STTPlugin {
  constructor(private readonly options: GeminiLiveSTTOptions) {}

  createStream(_options?: STTStreamOptions): STTStream {
    return new GeminiLiveSTTStream({
      ...this.options,
      language: _options?.language ?? this.options.language,
    });
  }
}
