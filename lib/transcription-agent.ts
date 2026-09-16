import { EventEmitter } from "events";
import { VoiceAgent } from "@dtelecom/agents-js";
import { DataPacket_Kind, RemoteAudioTrack, Room } from "@dtelecom/server-sdk-node";
import { geminiTranscribeAudio, pcm16ToWav } from "./gemini";
import { AGENT_IDENTITY, createAccessToken, getRoomService, sanitizeMediaUrl, TRANSCRIPT_TOPIC } from "./dtelecom";
import { appendTranscript, getRoomState, updateRoomState } from "./room-store";
import type { TranscriptSegment } from "./types";

const SAMPLE_RATE = 16000;
const FLUSH_BYTES = SAMPLE_RATE * 2 * 2;

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

async function publishTranscript(
  roomName: string,
  serverUrl: string | undefined,
  segment: TranscriptSegment,
  publisher?: DataPublisher | null
) {
  await appendTranscript(roomName, segment);
  const payload = new TextEncoder().encode(
    JSON.stringify({
      type: "transcript",
      speaker: segment.speaker,
      text: segment.text,
      at: segment.at,
      isFinal: segment.isFinal !== false,
    })
  );
  if (publisher) {
    try {
      await publisher.publishData(payload, { topic: TRANSCRIPT_TOPIC, kind: DataPacket_Kind.RELIABLE });
    } catch {
      // Fall through to the RoomService broadcast.
    }
  }
  try {
    const svc = await getRoomService(serverUrl);
    await svc.sendData(roomName, payload, DataPacket_Kind.RELIABLE, { topic: TRANSCRIPT_TOPIC });
  } catch {
    // KV already holds the transcript if the data broadcast misses a node.
  }
}

class GeminiSTTStream extends EventEmitter {
  private buffer = Buffer.alloc(0);
  private closed = false;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly apiKey: string,
    private readonly language?: string
  ) {
    super();
  }

  sendAudio(pcm16: Buffer): void {
    if (this.closed || !pcm16.length) return;
    this.buffer = Buffer.concat([this.buffer, pcm16]);
    if (this.buffer.length >= FLUSH_BYTES) {
      this.flushing = this.flushing.then(() => this.flush());
    }
  }

  private async flush(): Promise<void> {
    if (this.closed || this.buffer.length < SAMPLE_RATE) return;
    const chunk = this.buffer;
    this.buffer = Buffer.alloc(0);
    try {
      const text = (await geminiTranscribeAudio(this.apiKey, pcm16ToWav(chunk, SAMPLE_RATE), this.language)).trim();
      if (!text || this.closed) return;
      this.emit("transcription", { text, isFinal: true });
    } catch (error) {
      console.error("[STT] GeminiSTTStream flush failed", error);
      this.emit("error", error instanceof Error ? error : new Error("STT failed"));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flushing;
    await this.flush();
  }
}

class GeminiSTT {
  constructor(
    private readonly apiKey: string,
    private readonly language?: string
  ) {}

  createStream() {
    return new GeminiSTTStream(this.apiKey, this.language);
  }
}

class SilentLLM {
  async *chat(): AsyncGenerator<{ type: "done" }> {
    yield { type: "done" };
  }
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
    stt: new GeminiSTT(options.geminiKey, options.language),
    llm: new SilentLLM(),
    instructions: "You are a silent meeting transcription agent. Transcribe all speakers. Do not reply.",
    respondMode: "addressed",
    agentName: "dspaces-transcriber",
  });

  agent.on("transcription", (result: { text?: string; isFinal?: boolean; speaker?: string }) => {
    const text = result.text?.trim();
    if (!text || result.isFinal === false) return;
    void publishTranscript(
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

async function startRoomAgent(options: AgentStartOptions): Promise<AgentHandle> {
  const { token, wsUrl } = await resolveAgentConnection(options);
  const room = new Room();
  const buffers = new Map<string, Buffer>();
  const listening = new Set<string>();
  let stopped = false;

  const flushSpeaker = async (speaker: string, force = false) => {
    const buf = buffers.get(speaker);
    if (!buf) return;
    if (!force && buf.length < FLUSH_BYTES) return;
    buffers.set(speaker, Buffer.alloc(0));
    try {
      const text = (await geminiTranscribeAudio(options.geminiKey, pcm16ToWav(buf, SAMPLE_RATE), options.language)).trim();
      if (!text || stopped) return;
      await publishTranscript(
        options.roomName,
        wsUrl,
        {
          speaker,
          text,
          at: Date.now(),
          isFinal: true,
        },
        room.localParticipant
      );
    } catch (error) {
      console.error("[STT] agent flush failed", speaker, error);
    }
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
    void (async () => {
      try {
        const stream = track.createStream(SAMPLE_RATE, 1);
        for await (const frame of stream) {
          if (stopped || options.signal.aborted) break;
          const chunk = frameToPcm(frame);
          if (!chunk.length) continue;
          const prev = buffers.get(identity) || Buffer.alloc(0);
          const next = Buffer.concat([prev, chunk]);
          buffers.set(identity, next);
          if (next.length >= FLUSH_BYTES) {
            await flushSpeaker(identity);
          }
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
    for (const speaker of buffers.keys()) {
      await flushSpeaker(speaker, true);
    }
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
  } catch {
    return startVoiceAgent({ ...options, geminiKey });
  }
}
