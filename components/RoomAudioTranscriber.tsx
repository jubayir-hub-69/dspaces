"use client";

import { useEffect, useRef } from "react";
import { useRoomContext } from "@dtelecom/components-react";
import { RoomEvent, Track } from "@dtelecom/livekit-client";
import { isAiAgent } from "../lib/types";

const TARGET_RATE = 16000;
const FLUSH_MS = 2200;
const MIN_PCM_BYTES = TARGET_RATE * 2;

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function pcmEnergy(buf: Int16Array) {
  if (!buf.length) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i += 8) {
    const s = buf[i] / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / Math.ceil(buf.length / 8));
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

export function RoomAudioTranscriber({
  active,
  roomId,
  token,
  serverUrl,
  language,
}: {
  active: boolean;
  roomId: string;
  token: string;
  serverUrl: string;
  language: string;
}) {
  const room = useRoomContext();
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    if (!active || !room || !roomId || !token) return;
    let stopped = false;
    const buffers = new Map<string, Int16Array>();
    const graphs = new Map<string, { ctx: AudioContext; node: ScriptProcessorNode; src: MediaStreamAudioSourceNode }>();

    const appendPcm = (identity: string, chunk: Int16Array) => {
      const prev = buffers.get(identity);
      if (!prev) {
        buffers.set(identity, chunk);
        return;
      }
      const next = new Int16Array(prev.length + chunk.length);
      next.set(prev);
      next.set(chunk, prev.length);
      buffers.set(identity, next);
    };

    const attachTrack = (identity: string, media?: MediaStreamTrack | null) => {
      if (stopped || !media || media.kind !== "audio" || identity === "ai_agent") return;
      const key = `${identity}:${media.id}`;
      if (graphs.has(key)) return;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(new MediaStream([media]));
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      node.onaudioprocess = (event) => {
        if (stopped) return;
        const input = event.inputBuffer.getChannelData(0);
        appendPcm(identity, downsampleTo16k(input, ctx.sampleRate || event.inputBuffer.sampleRate));
      };
      src.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
      void ctx.resume();
      graphs.set(key, { ctx, node, src });
    };

    const scan = () => {
      if (stopped || !room) return;
      const everyone = [room.localParticipant, ...Array.from(room.participants.values())];
      everyone.forEach((participant) => {
        if (isAiAgent(participant)) return;
        const identity = participant.identity || participant.name || "Participant";
        const mic = participant.getTrack?.(Track.Source.Microphone);
        const shareAudio = participant.getTrack?.(Track.Source.ScreenShareAudio);
        attachTrack(identity, mic?.track?.mediaStreamTrack);
        attachTrack(identity, shareAudio?.track?.mediaStreamTrack);
      });
    };

    const flush = async () => {
      if (stopped) return;
      const pending = Array.from(buffers.entries());
      buffers.clear();
      for (const [speaker, pcm] of pending) {
        if (pcm.byteLength < MIN_PCM_BYTES) {
          buffers.set(speaker, pcm);
          continue;
        }
        if (pcmEnergy(pcm) < 0.012) continue;
        try {
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
          await res.json().catch(() => null);
        } catch {
          // Keep capturing even if a single chunk fails.
        }
      }
    };

    scan();
    const scanTimer = setInterval(scan, 1500);
    const flushTimer = setInterval(() => {
      void flush();
    }, FLUSH_MS);

    const onTrack = () => scan();
    room.on(RoomEvent.TrackSubscribed, onTrack);
    room.on(RoomEvent.TrackPublished, onTrack);
    room.on(RoomEvent.ParticipantConnected, onTrack);
    room.on(RoomEvent.LocalTrackPublished, onTrack);

    return () => {
      stopped = true;
      clearInterval(scanTimer);
      clearInterval(flushTimer);
      room.off(RoomEvent.TrackSubscribed, onTrack);
      room.off(RoomEvent.TrackPublished, onTrack);
      room.off(RoomEvent.ParticipantConnected, onTrack);
      room.off(RoomEvent.LocalTrackPublished, onTrack);
      void flush();
      graphs.forEach(({ ctx, node, src }) => {
        try {
          node.disconnect();
          src.disconnect();
          void ctx.close();
        } catch {
          // Ignore teardown races.
        }
      });
      graphs.clear();
    };
  }, [active, room, roomId, serverUrl, token]);

  return null;
}
