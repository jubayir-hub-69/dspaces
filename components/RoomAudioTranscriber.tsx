"use client";

import { useEffect, useRef } from "react";
import { useRoomContext } from "@dtelecom/components-react";
import { RoomEvent, Track } from "@dtelecom/livekit-client";
import { isAiAgent, type TranscriptSegment } from "../lib/types";

const TARGET_RATE = 16000;
const TICK_MS = 280;
const FRAME_SAMPLES = 320;
const OVERLAP_SAMPLES = Math.floor(TARGET_RATE * 0.3);
const PREROLL_SAMPLES = Math.floor(TARGET_RATE * 0.25);
const MAX_SEND_SAMPLES = Math.floor(TARGET_RATE * 1.8);
const MIN_SPEECH_SAMPLES = Math.floor(TARGET_RATE * 0.28);
const SILENCE_END_SAMPLES = Math.floor(TARGET_RATE * 0.5);
const MAX_SILENCE_KEEP = Math.floor(TARGET_RATE * 0.35);
const SPEECH_RMS = 0.006;
const SILENCE_RMS = 0.0035;

type Graph = {
  ctx: AudioContext;
  node: ScriptProcessorNode;
  src: MediaStreamAudioSourceNode;
  silent: GainNode;
  cloned: MediaStreamTrack;
  ownsClone: boolean;
  el: HTMLAudioElement;
  onState: () => void;
};

type SpeakerCapture = {
  frames: Int16Array[];
  samples: number;
  overlap: Int16Array;
  sending: boolean;
};

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function concatFrames(frames: Int16Array[], start = 0, end?: number): Int16Array {
  const last = end ?? frames.length;
  let len = 0;
  for (let i = start; i < last; i++) len += frames[i].length;
  const out = new Int16Array(len);
  let offset = 0;
  for (let i = start; i < last; i++) {
    out.set(frames[i], offset);
    offset += frames[i].length;
  }
  return out;
}

function concatPcm(parts: Int16Array[]): Int16Array {
  const nonempty = parts.filter((part) => part.length > 0);
  if (nonempty.length === 0) return new Int16Array(0);
  if (nonempty.length === 1) return nonempty[0];
  return concatFrames(nonempty);
}

function slicePcm(pcm: Int16Array, start: number, end: number): Int16Array {
  const from = Math.max(0, start);
  const to = Math.min(pcm.length, end);
  if (to <= from) return new Int16Array(0);
  return pcm.subarray(from, to);
}

function frameRms(pcm: Int16Array, offset: number, length: number): number {
  if (length <= 0) return 0;
  let sum = 0;
  let count = 0;
  const last = Math.min(pcm.length, offset + length);
  for (let i = offset; i < last; i += 4) {
    const s = pcm[i] / 32768;
    sum += s * s;
    count += 1;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function speechBounds(pcm: Int16Array): { start: number; end: number } | null {
  let first = -1;
  let last = -1;
  for (let i = 0; i < pcm.length; i += FRAME_SAMPLES) {
    const len = Math.min(FRAME_SAMPLES, pcm.length - i);
    if (frameRms(pcm, i, len) >= SPEECH_RMS) {
      if (first < 0) first = i;
      last = i + len;
    }
  }
  if (first < 0) return null;
  return { start: first, end: last };
}

function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === TARGET_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / TARGET_RATE;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.min(input.length - 1, Math.floor(i * ratio))]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function audioPublications(participant: {
  getTrack?: (source: Track.Source) => { track?: { mediaStreamTrack?: MediaStreamTrack } | null } | undefined;
  audioTracks?: Map<string, { track?: { mediaStreamTrack?: MediaStreamTrack } | null }>;
  tracks?: Map<string, { kind?: string; track?: { kind?: string; mediaStreamTrack?: MediaStreamTrack } | null }>;
}) {
  const pubs: Array<{ track?: { mediaStreamTrack?: MediaStreamTrack } | null } | undefined> = [
    participant.getTrack?.(Track.Source.Microphone),
    participant.getTrack?.(Track.Source.ScreenShareAudio),
  ];
  participant.audioTracks?.forEach((pub) => pubs.push(pub));
  participant.tracks?.forEach((pub) => {
    if (pub.kind === Track.Kind.Audio || pub.track?.kind === "audio") pubs.push(pub);
  });
  return pubs;
}

function ensureSpeaker(speakers: Map<string, SpeakerCapture>, identity: string): SpeakerCapture {
  let state = speakers.get(identity);
  if (!state) {
    state = { frames: [], samples: 0, overlap: new Int16Array(0), sending: false };
    speakers.set(identity, state);
  }
  return state;
}

function takeFrames(state: SpeakerCapture, sampleCount: number): Int16Array {
  const take = Math.min(sampleCount, state.samples);
  if (take <= 0) return new Int16Array(0);
  const out = new Int16Array(take);
  let copied = 0;
  while (copied < take && state.frames.length) {
    const frame = state.frames[0];
    const need = take - copied;
    if (frame.length <= need) {
      out.set(frame, copied);
      copied += frame.length;
      state.frames.shift();
    } else {
      out.set(frame.subarray(0, need), copied);
      state.frames[0] = frame.subarray(need);
      copied += need;
    }
  }
  state.samples -= copied;
  return copied === take ? out : out.subarray(0, copied);
}

function keepTail(state: SpeakerCapture, keepSamples: number) {
  if (state.samples <= keepSamples) return;
  const drop = state.samples - keepSamples;
  takeFrames(state, drop);
}

export function RoomAudioTranscriber({
  active,
  roomId,
  token,
  serverUrl,
  language,
  onSegment,
}: {
  active: boolean;
  roomId: string;
  token: string;
  serverUrl: string;
  language: string;
  onSegment?: (segment: TranscriptSegment, fullText: string) => void;
}) {
  const room = useRoomContext();
  const languageRef = useRef(language);
  languageRef.current = language;
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;

  useEffect(() => {
    if (!active || !room || !roomId || !token) return;
    let stopped = false;
    const speakers = new Map<string, SpeakerCapture>();
    const graphs = new Map<string, Graph>();
    let tickTimer = 0;
    let watchdogTimer = 0;

    const appendPcm = (identity: string, chunk: Int16Array) => {
      if (!chunk.length) return;
      const state = ensureSpeaker(speakers, identity);
      state.frames.push(chunk);
      state.samples += chunk.length;
    };

    const teardownGraph = (key: string) => {
      const graph = graphs.get(key);
      if (!graph) return;
      graphs.delete(key);
      try {
        graph.ctx.removeEventListener("statechange", graph.onState);
        graph.node.disconnect();
        graph.src.disconnect();
        graph.silent.disconnect();
        void graph.ctx.close();
        graph.el.pause();
        graph.el.srcObject = null;
        if (graph.ownsClone && graph.cloned.readyState === "live") graph.cloned.stop();
      } catch {
        // Ignore teardown races.
      }
    };

    const attachTrack = (identity: string, media?: MediaStreamTrack | null) => {
      if (stopped || !media || media.kind !== "audio" || identity === "ai_agent") return;
      if (media.readyState === "ended") return;
      const key = `${identity}:${media.id}`;
      const existing = graphs.get(key);
      if (existing) {
        if (existing.ctx.state !== "running") void existing.ctx.resume();
        return;
      }

      let cloned: MediaStreamTrack;
      let ownsClone = true;
      try {
        cloned = media.clone();
      } catch (error) {
        console.warn("[STT] track clone failed, using original", identity, error);
        cloned = media;
        ownsClone = false;
      }

      let ctx: AudioContext;
      try {
        ctx = new AudioContext({ sampleRate: TARGET_RATE });
      } catch {
        ctx = new AudioContext();
      }
      const stream = new MediaStream([cloned]);
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      const el = new Audio();
      el.muted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.srcObject = stream;
      void el.play().catch(() => undefined);

      node.onaudioprocess = (event) => {
        if (stopped) return;
        const input = event.inputBuffer.getChannelData(0);
        appendPcm(identity, downsampleTo16k(input, ctx.sampleRate || event.inputBuffer.sampleRate));
      };
      src.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);

      const onState = () => {
        if (!stopped && ctx.state !== "running") void ctx.resume();
      };
      ctx.addEventListener("statechange", onState);
      void ctx.resume().then(() => {
        console.log("[STT] attached audio", {
          identity,
          contextState: ctx.state,
          sampleRate: ctx.sampleRate,
          trackState: cloned.readyState,
        });
      });
      graphs.set(key, { ctx, node, src, silent, cloned, ownsClone, el, onState });
    };

    const scan = () => {
      if (stopped || !room) return;
      for (const [key, graph] of Array.from(graphs.entries())) {
        if (graph.cloned.readyState === "ended") teardownGraph(key);
      }
      const everyone = [room.localParticipant, ...Array.from(room.participants.values())];
      everyone.forEach((participant) => {
        if (isAiAgent(participant)) return;
        const identity = participant.identity || participant.name || "Participant";
        audioPublications(participant).forEach((pub) => {
          attachTrack(identity, pub?.track?.mediaStreamTrack);
        });
      });
    };

    const sendChunk = async (speaker: string, state: SpeakerCapture, pcm: Int16Array) => {
      if (!pcm.length) {
        state.sending = false;
        return;
      }
      try {
        console.log("[STT] sending chunk", { speaker, samples: pcm.length, ms: Math.round((pcm.length / TARGET_RATE) * 1000) });
        const res = await fetch("/api/transcribe-chunk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            room: roomId,
            speaker,
            language: languageRef.current,
            serverUrl,
            sampleRate: TARGET_RATE,
            pcmBase64: int16ToBase64(pcm),
          }),
        });
        const data = (await res.json().catch(() => null)) as { text?: string; transcript?: string; error?: string } | null;
        if (!res.ok && !data) {
          console.error("[STT] transcribe-chunk failed", res.status);
          return;
        }
        if (data?.text) {
          console.log("[STT] transcript chunk", { speaker, text: data.text });
          onSegmentRef.current?.(
            { speaker, text: data.text, at: Date.now(), isFinal: true },
            data.transcript || ""
          );
        }
      } catch (error) {
        console.error("[STT] transcribe-chunk request error", error);
      } finally {
        state.sending = false;
      }
    };

    const flushReady = () => {
      speakers.forEach((state, speaker) => {
        if (state.sending || state.samples <= 0) return;

        const captured = concatFrames(state.frames);
        const bounds = speechBounds(captured);
        if (!bounds) {
          keepTail(state, MAX_SILENCE_KEEP);
          return;
        }

        const trailingSilence = captured.length - bounds.end;
        const speechLen = bounds.end - bounds.start;
        const hitMax = captured.length >= MAX_SEND_SAMPLES + PREROLL_SAMPLES;
        const utteranceEnded = trailingSilence >= SILENCE_END_SAMPLES;
        if (!hitMax && !utteranceEnded) return;
        if (speechLen < MIN_SPEECH_SAMPLES && !hitMax) return;

        const start = Math.max(0, bounds.start - PREROLL_SAMPLES);
        const end = hitMax && !utteranceEnded
          ? Math.min(captured.length, Math.max(start + MIN_SPEECH_SAMPLES, start + MAX_SEND_SAMPLES))
          : Math.min(captured.length, bounds.end);
        const slice = slicePcm(captured, start, end);
        if (slice.length < MIN_SPEECH_SAMPLES) return;

        const prevOverlap = state.overlap;
        takeFrames(state, end);
        state.overlap = slicePcm(slice, Math.max(0, slice.length - OVERLAP_SAMPLES), slice.length).slice();
        const payload = concatPcm([prevOverlap, slice]);
        if (frameRms(payload, 0, payload.length) < SILENCE_RMS) {
          state.sending = false;
          return;
        }
        state.sending = true;
        void sendChunk(speaker, state, payload.slice());
      });
    };

    const tick = () => {
      if (stopped) return;
      try {
        flushReady();
      } catch (error) {
        console.error("[STT] flush tick failed; capture continues", error);
      }
      if (!stopped) tickTimer = window.setTimeout(tick, TICK_MS);
    };

    const onVisibility = () => {
      if (document.hidden || stopped) return;
      graphs.forEach((graph) => {
        if (graph.ctx.state !== "running") void graph.ctx.resume();
        void graph.el.play().catch(() => undefined);
      });
    };

    console.log("[STT] starting client audio capture", { roomId });
    scan();
    tick();
    const scanTimer = window.setInterval(scan, 1500);
    watchdogTimer = window.setInterval(() => {
      if (stopped) return;
      graphs.forEach((graph) => {
        if (graph.ctx.state !== "running") {
          console.log("[STT] resuming AudioContext", graph.ctx.state);
          void graph.ctx.resume();
        }
        if (graph.el.paused) void graph.el.play().catch(() => undefined);
      });
    }, 1000);
    document.addEventListener("visibilitychange", onVisibility);

    const onTrack = () => scan();
    room.on(RoomEvent.TrackSubscribed, onTrack);
    room.on(RoomEvent.TrackPublished, onTrack);
    room.on(RoomEvent.ParticipantConnected, onTrack);
    room.on(RoomEvent.LocalTrackPublished, onTrack);

    return () => {
      stopped = true;
      window.clearTimeout(tickTimer);
      window.clearInterval(scanTimer);
      window.clearInterval(watchdogTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      room.off(RoomEvent.TrackSubscribed, onTrack);
      room.off(RoomEvent.TrackPublished, onTrack);
      room.off(RoomEvent.ParticipantConnected, onTrack);
      room.off(RoomEvent.LocalTrackPublished, onTrack);
      Array.from(graphs.keys()).forEach(teardownGraph);
      speakers.clear();
      console.log("[STT] stopped client audio capture");
    };
  }, [active, room, roomId, serverUrl, token]);

  return null;
}
