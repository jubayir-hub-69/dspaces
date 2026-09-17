import { VoiceAgent } from "@dtelecom/agents-js";
import { DataPacket_Kind, RemoteAudioTrack, Room } from "@dtelecom/server-sdk-node";
import { AsyncQueue } from "./async-queue";
import { AGENT_IDENTITY, createAccessToken, getRoomService, sanitizeMediaUrl, TRANSCRIPT_TOPIC } from "./dtelecom";
import { GeminiLiveSTT, GeminiLiveSTTStream } from "./gemini-live-stt";
import { appendTranscript, getRoomState, updateRoomState } from "./room-store";
import type { TranscriptSegment } from "./types";

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const FRAME_MS = 20;
const FRAME_BYTES = Math.floor((SAMPLE_RATE * BYTES_PER_SAMPLE * FRAME_MS) / 1000);
const PREROLL_BYTES = Math.floor(SAMPLE_RATE * BYTES_PER_SAMPLE * 0.3);
const OVERLAP_BYTES = Math.floor(SAMPLE_RATE * BYTES_PER_SAMPLE * 0.5);
const END_SILENCE_BYTES = Math.floor(SAMPLE_RATE * BYTES_PER_SAMPLE * 0.7);
const MIN_SPEECH_BYTES = Math.floor(SAMPLE_RATE * BYTES_PER_SAMPLE * 0.2);
const MAX_UTTERANCE_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * 12;
const HISTORY_BYTES = Math.max(PREROLL_BYTES, OVERLAP_BYTES);
const SPEECH_RMS = 0.006;
const SILENCE_RMS = 0.0035;

type AgentHandle = {
  stop: () => Promise<void>;
};

type DataPublisher = {
  publishData: (data: Uint8Array, options?: { topic?: string; kind?: DataPacket_Kind }) => Promise<void>;
};

type AgentStartOptions = {
  roomName: string;
  language?: string;
  signal: AbortSignal;
  geminiKey: string;
  serverUrl?: string;
};

type SttWork =
  | { type: "start" }
  | { type: "audio"; pcm: Buffer }
  | { type: "end" };

function pcmRms(pcm: Buffer): number {
  if (pcm.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 1 < pcm.length; i += 16) {
    const s = pcm.readInt16LE(i) / 32768;
    sum += s * s;
    count += 1;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function tail(buf: Buffer, bytes: number): Buffer {
  if (bytes <= 0 || buf.length <= bytes) return Buffer.from(buf);
  return Buffer.from(buf.subarray(buf.length - bytes));
}

function concatPcm(parts: Buffer[]): Buffer {
  const nonempty = parts.filter((part) => part.length > 0);
  if (nonempty.length === 0) return Buffer.alloc(0);
  if (nonempty.length === 1) return nonempty[0];
  return Buffer.concat(nonempty);
}

async function resolveAgentConnection(options: AgentStartOptions) {
  const at = await createAccessToken({
    identity: AGENT_IDENTITY,
    name: "dSpaces AI Agent",
    metadata: JSON.stringify({ role: "guest", isCoHost: false, agent: true }),
    room: options.roomName,
    canPublish: false,
    canPublishData: true,
    canSubscribe: true,
    hidden: false,
  });
  const token = at.toJwt();
  const wsUrl = sanitizeMediaUrl(options.serverUrl) || (await at.getWsUrl());
  if (!wsUrl) {
    throw new Error("dTelecom could not assign a video node for the AI agent.");
  }
  return { token, wsUrl };
}

async function persistFinalTranscript(
  roomName: string,
  serverUrl: string | undefined,
  segment: TranscriptSegment,
  publisher?: DataPublisher | null
) {
  if (segment.isFinal === false) return;
  await appendTranscript(roomName, segment);
  const payload = new TextEncoder().encode(
    JSON.stringify({
      type: "transcript",
      speaker: segment.speaker,
      text: segment.text,
      at: segment.at,
      isFinal: true,
    })
  );
  if (publisher) {
    try {
      await publisher.publishData(payload, { topic: TRANSCRIPT_TOPIC, kind: DataPacket_Kind.RELIABLE });
    } catch {
      // Fall through to RoomService.
    }
  }
  try {
    const svc = await getRoomService(serverUrl);
    await svc.sendData(roomName, payload, DataPacket_Kind.RELIABLE, { topic: TRANSCRIPT_TOPIC });
  } catch {
    // Vercel KV already holds the final transcript if the data broadcast misses a node.
  }
}

class SilentLLM {
  async *chat(): AsyncGenerator<{ type: "done" }> {
    yield { type: "done" };
  }
}

/**
 * Per-speaker pipeline:
 * Audio capture (never blocks) -> Audio Queue -> VAD/Segmenter -> STT Queue -> Worker
 *
 * VAD: 300ms pre-roll, 500ms overlap, 700ms END_SILENCE.
 * The Gemini Live session is never closed on silence.
 */
class SpeakerPipeline {
  private readonly audioQueue = new AsyncQueue<Buffer>();
  private readonly sttQueue = new AsyncQueue<SttWork>();
  private readonly stream: GeminiLiveSTTStream;
  private history: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private overlap: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private speaking = false;
  private speechBytes = 0;
  private voicedBytes = 0;
  private silenceBytes = 0;
  private remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private stopped = false;
  private lastFinalText = "";
  private lastFinalAt = 0;
  private receivedFrames = 0;

  constructor(
    private readonly speaker: string,
    private readonly options: AgentStartOptions,
    private readonly publisher: () => DataPublisher | null | undefined
  ) {
    this.stream = new GeminiLiveSTTStream({
      apiKey: options.geminiKey,
      language: options.language,
      automaticActivityDetection: false,
      prefixPaddingMs: 300,
      silenceDurationMs: 700,
    });
    this.stream.on("transcription", (result) => {
      if (!result.text?.trim()) return;
      if (result.isFinal) {
        void this.publishFinal(result.text);
        return;
      }
      console.log("[STT] interim", { speaker: this.speaker, text: result.text.slice(0, 80) });
    });
    this.stream.on("error", (error) => {
      console.warn("[STT] live stream error", this.speaker, error.message);
    });
    void this.runVadWorker();
    void this.runSttWorker();
  }

  /** Capture path: enqueue only. Never awaits STT or network. */
  pushPcm(pcm: Buffer): void {
    if (this.stopped || !pcm.length) return;
    this.receivedFrames += 1;
    if (this.receivedFrames === 1 || this.receivedFrames % 500 === 0) {
      console.log("[STT] capture", { speaker: this.speaker, frames: this.receivedFrames, queued: this.audioQueue.size });
    }
    this.audioQueue.enqueue(pcm);
  }

  async close(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.speaking) {
      this.sttQueue.enqueue({ type: "end" });
    }
    this.audioQueue.close();
    this.sttQueue.close();
    await this.stream.close();
  }

  private async runVadWorker(): Promise<void> {
    try {
      while (!this.stopped) {
        const chunk = await this.audioQueue.dequeue();
        if (!chunk) break;
        this.consumeAudio(chunk);
      }
    } catch (error) {
      console.warn("[STT] VAD worker stopped", this.speaker, error);
    }
  }

  private consumeAudio(incoming: Buffer): void {
    this.remainder = Buffer.concat([this.remainder, incoming]);
    while (this.remainder.length >= FRAME_BYTES) {
      const frame = Buffer.from(this.remainder.subarray(0, FRAME_BYTES));
      this.remainder = Buffer.from(this.remainder.subarray(FRAME_BYTES));
      this.processFrame(frame);
    }
  }

  private processFrame(frame: Buffer): void {
    this.history = tail(Buffer.concat([this.history, frame]), HISTORY_BYTES);
    const energy = pcmRms(frame);
    const isSpeech = energy >= SPEECH_RMS;
    const isSilence = energy < SILENCE_RMS;

    if (!this.speaking) {
      if (!isSpeech) return;
      this.speaking = true;
      this.speechBytes = frame.length;
      this.voicedBytes = frame.length;
      this.silenceBytes = 0;
      const preroll = tail(this.history, PREROLL_BYTES);
      const startPcm = concatPcm([this.overlap, preroll, frame]);
      this.overlap = Buffer.alloc(0);
      this.sttQueue.enqueue({ type: "start" });
      this.sttQueue.enqueue({ type: "audio", pcm: startPcm });
      return;
    }

    this.sttQueue.enqueue({ type: "audio", pcm: frame });
    this.speechBytes += frame.length;
    if (isSilence) {
      this.silenceBytes += frame.length;
    } else if (isSpeech) {
      this.silenceBytes = 0;
      this.voicedBytes += frame.length;
    }

    const endedBySilence = this.silenceBytes >= END_SILENCE_BYTES;
    const endedByMax = this.speechBytes >= MAX_UTTERANCE_BYTES;
    if (!endedBySilence && !endedByMax) return;
    if (this.voicedBytes < MIN_SPEECH_BYTES && !endedByMax) {
      this.speaking = false;
      this.silenceBytes = 0;
      this.speechBytes = 0;
      this.voicedBytes = 0;
      this.sttQueue.enqueue({ type: "end" });
      return;
    }

    this.overlap = tail(this.history, OVERLAP_BYTES);
    this.speaking = false;
    this.silenceBytes = 0;
    this.speechBytes = 0;
    this.voicedBytes = 0;
    this.sttQueue.enqueue({ type: "end" });
  }

  private async runSttWorker(): Promise<void> {
    const batch: Buffer[] = [];
    const flushBatch = () => {
      if (!batch.length) return;
      this.stream.sendAudio(Buffer.concat(batch));
      batch.length = 0;
    };

    while (!this.stopped) {
      const item = await this.sttQueue.dequeue();
      if (!item) break;
      try {
        if (item.type === "start") {
          flushBatch();
          this.stream.beginUtterance();
        } else if (item.type === "audio") {
          batch.push(item.pcm);
          const bytes = batch.reduce((total, part) => total + part.length, 0);
          if (bytes >= SAMPLE_RATE * BYTES_PER_SAMPLE * 0.1) flushBatch();
        } else {
          flushBatch();
          this.stream.endUtterance();
        }
      } catch (error) {
        console.warn("[STT] worker send failed; session kept alive", this.speaker, error);
      }
    }
  }

  private async publishFinal(text: string): Promise<void> {
    const cleaned = text.trim();
    if (!cleaned) return;
    const now = Date.now();
    if (cleaned === this.lastFinalText && now - this.lastFinalAt < 1500) return;
    this.lastFinalText = cleaned;
    this.lastFinalAt = now;
    console.log("[STT] final", { speaker: this.speaker, text: cleaned.slice(0, 120) });
    await persistFinalTranscript(
      this.options.roomName,
      this.options.serverUrl,
      {
        speaker: this.speaker,
        text: cleaned,
        at: now,
        isFinal: true,
      },
      this.publisher()
    );
  }
}

async function startRoomAgent(options: AgentStartOptions): Promise<AgentHandle> {
  const { token, wsUrl } = await resolveAgentConnection(options);
  const room = new Room();
  const pipelines = new Map<string, SpeakerPipeline>();
  const listening = new Set<string>();
  let stopped = false;

  const publisher = () => room.localParticipant;

  const pipelineFor = (speaker: string) => {
    let pipeline = pipelines.get(speaker);
    if (!pipeline) {
      pipeline = new SpeakerPipeline(speaker, { ...options, serverUrl: wsUrl }, publisher);
      pipelines.set(speaker, pipeline);
      console.log("[STT] speaker pipeline started", speaker);
    }
    return pipeline;
  };

  const isAudioTrack = (track: unknown): track is RemoteAudioTrack =>
    !!track && typeof (track as RemoteAudioTrack).createStream === "function";

  const frameToPcm = (frame: { toBuffer?: () => Buffer; data?: Int16Array } | Buffer): Buffer => {
    if (Buffer.isBuffer(frame)) return frame;
    if (frame && typeof frame.toBuffer === "function") return frame.toBuffer();
    if (frame?.data instanceof Int16Array) {
      return Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    }
    return Buffer.alloc(0);
  };

  const listenToAudio = (track: RemoteAudioTrack, participant: { identity?: string; name?: string }) => {
    const identity = participant.identity || participant.name || "Participant";
    if (identity === AGENT_IDENTITY) return;
    const key = `${identity}:${track.sid || identity}`;
    if (listening.has(key)) return;
    listening.add(key);
    const pipeline = pipelineFor(identity);

    void (async () => {
      try {
        const stream = track.createStream(SAMPLE_RATE, 1);
        for await (const frame of stream) {
          if (stopped || options.signal.aborted) break;
          const chunk = frameToPcm(frame);
          if (!chunk.length) continue;
          pipeline.pushPcm(chunk);
        }
      } catch {
        // Track ended or agent disconnected.
      } finally {
        listening.delete(key);
      }
    })();
  };

  const attachExistingTracks = () => {
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        if (isAudioTrack(publication.track)) {
          listenToAudio(publication.track, participant);
        }
      });
    });
  };

  room.on("trackSubscribed", (track, _pub, participant) => {
    if (isAudioTrack(track)) {
      listenToAudio(track, participant);
    }
  });
  room.on("trackPublished", () => attachExistingTracks());
  room.on("participantConnected", (participant) => {
    participant.on("trackSubscribed", (track: unknown) => {
      if (isAudioTrack(track)) listenToAudio(track, participant);
    });
    attachExistingTracks();
  });
  room.on("participantDisconnected", (participant) => {
    const identity = participant.identity || participant.name || "";
    const pipeline = pipelines.get(identity);
    if (pipeline) {
      void pipeline.close();
      pipelines.delete(identity);
    }
  });

  await room.connect(wsUrl, token, { autoSubscribe: true });
  room.remoteParticipants.forEach((participant) => {
    participant.on("trackSubscribed", (track: unknown) => {
      if (isAudioTrack(track)) listenToAudio(track, participant);
    });
  });
  attachExistingTracks();
  const attachTimer = setInterval(() => {
    if (stopped || options.signal.aborted) return;
    attachExistingTracks();
  }, 1500);

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(attachTimer);
    for (const pipeline of pipelines.values()) {
      await pipeline.close();
    }
    pipelines.clear();
    try {
      await room.disconnect();
    } catch {
      // Ignore disconnect races.
    }
    const state = await getRoomState(options.roomName);
    if (state) {
      await updateRoomState(options.roomName, (current) => ({ ...current, agentActive: false }));
    }
  };

  options.signal.addEventListener("abort", () => {
    void stop();
  });

  return { stop };
}

async function startVoiceAgent(options: AgentStartOptions): Promise<AgentHandle> {
  const at = await createAccessToken({
    identity: AGENT_IDENTITY,
    name: "dSpaces AI Agent",
    metadata: JSON.stringify({ role: "guest", isCoHost: false, agent: true }),
    room: options.roomName,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    hidden: false,
  });
  const wsUrl = sanitizeMediaUrl(options.serverUrl) || (await at.getWsUrl());
  if (!wsUrl) {
    throw new Error("dTelecom could not assign a video node for the AI agent.");
  }

  const agent = new VoiceAgent({
    stt: new GeminiLiveSTT({
      apiKey: options.geminiKey,
      language: options.language,
      automaticActivityDetection: true,
      prefixPaddingMs: 300,
      silenceDurationMs: 700,
    }),
    llm: new SilentLLM(),
    instructions: "You are a silent meeting transcription agent. Transcribe all speakers. Do not reply.",
    respondMode: "addressed",
    agentName: "dspaces-transcriber",
  });

  agent.on("transcription", (result: { text?: string; isFinal?: boolean; speaker?: string }) => {
    const text = result.text?.trim();
    if (!text || result.isFinal === false) return;
    void persistFinalTranscript(
      options.roomName,
      wsUrl,
      {
        speaker: result.speaker || "Participant",
        text,
        at: Date.now(),
        isFinal: true,
      },
      agent.room?.localParticipant
    );
  });

  await agent.start({
    room: options.roomName,
    identity: AGENT_IDENTITY,
    name: "dSpaces AI Agent",
    token: at.toJwt(),
    wsUrl,
  });

  const stop = async () => {
    await agent.stop();
    const state = await getRoomState(options.roomName);
    if (state) {
      await updateRoomState(options.roomName, (current) => ({ ...current, agentActive: false }));
    }
  };

  options.signal.addEventListener("abort", () => {
    void stop();
  });

  return { stop };
}

export async function runTranscriptionAgent(options: {
  roomName: string;
  language?: string;
  signal: AbortSignal;
  serverUrl?: string;
}): Promise<AgentHandle> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  await updateRoomState(options.roomName, (current) => ({ ...current, agentActive: true }));

  try {
    return await startRoomAgent({ ...options, geminiKey });
  } catch (error) {
    console.warn("[STT] room agent failed; falling back to VoiceAgent", error);
    return startVoiceAgent({ ...options, geminiKey });
  }
}
