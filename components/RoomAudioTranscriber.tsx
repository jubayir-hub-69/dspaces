"use client";

import { useEffect, useRef } from "react";
import { useRoomContext } from "@dtelecom/components-react";
import { RoomEvent, Track } from "@dtelecom/livekit-client";
import { isAiAgent, type TranscriptSegment } from "../lib/types";

const TARGET_RATE = 16000;
const FLUSH_MS = 2200;
const MIN_PCM_BYTES = TARGET_RATE * 2;
const ENERGY_THRESHOLD = 0.008;

type Graph = {
  ctx: AudioContext;
  node: ScriptProcessorNode;
  src: MediaStreamAudioSourceNode;
  silent: GainNode;
  cloned: MediaStreamTrack;
  ownsClone: boolean;
  el: HTMLAudioElement;
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
    const buffers = new Map<string, Int16Array>();
    const graphs = new Map<string, Graph>();
    let callbacks = 0;

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
      if (media.readyState === "ended") return;
      const key = `${identity}:${media.id}`;
      if (graphs.has(key)) return;

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
      el.srcObject = stream;
      void el.play().catch(() => {
        // Autoplay can fail; the AudioContext graph is the real capture path.
      });

      node.onaudioprocess = (event) => {
        if (stopped) return;
        callbacks += 1;
        const input = event.inputBuffer.getChannelData(0);
        appendPcm(identity, downsampleTo16k(input, ctx.sampleRate || event.inputBuffer.sampleRate));
      };
      src.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
      void ctx.resume().then(() => {
        console.log("[STT] attached audio", {
          identity,
          contextState: ctx.state,
          sampleRate: ctx.sampleRate,
          trackState: cloned.readyState,
          muted: cloned.muted,
          enabled: cloned.enabled,
        });
      });
      graphs.set(key, { ctx, node, src, silent, cloned, ownsClone, el });
    };

    const scan = () => {
      if (stopped || !room) return;
      const everyone = [room.localParticipant, ...Array.from(room.participants.values())];
      everyone.forEach((participant) => {
        if (isAiAgent(participant)) return;
        const identity = participant.identity || participant.name || "Participant";
        audioPublications(participant).forEach((pub) => {
          attachTrack(identity, pub?.track?.mediaStreamTrack);
        });
      });
    };

    const flush = async () => {
      if (stopped) return;
      const pending = Array.from(buffers.entries());
      buffers.clear();
      if (!pending.length && callbacks === 0) {
        console.warn("[STT] flush skipped: no audio callbacks yet", {
          graphs: graphs.size,
          contextStates: Array.from(graphs.values()).map((g) => g.ctx.state),
        });
      }
      for (const [speaker, pcm] of pending) {
        if (pcm.byteLength < MIN_PCM_BYTES) {
          buffers.set(speaker, pcm);
          continue;
        }
        const energy = pcmEnergy(pcm);
        if (energy < ENERGY_THRESHOLD) {
          console.log("[STT] skipping quiet chunk", { speaker, bytes: pcm.byteLength, energy });
          continue;
        }
        try {
          console.log("[STT] sending chunk", { speaker, bytes: pcm.byteLength, energy, language: languageRef.current });
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
          if (!res.ok) {
            console.error("[STT] transcribe-chunk failed", res.status, data?.error || data);
            continue;
          }
          if (data?.text) {
            console.log("[STT] transcript chunk", { speaker, text: data.text });
            const segment = { speaker, text: data.text, at: Date.now(), isFinal: true };
            const line = `${speaker}: ${data.text}`;
            onSegmentRef.current?.(segment, data.transcript || line);
          } else {
            console.log("[STT] transcribe-chunk returned no speech", { speaker });
          }
        } catch (error) {
          console.error("[STT] transcribe-chunk request error", error);
        }
      }
    };

    console.log("[STT] starting client audio capture", { roomId });
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
      graphs.forEach((graph) => {
        try {
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
      });
      graphs.clear();
      console.log("[STT] stopped client audio capture");
    };
  }, [active, room, roomId, serverUrl, token]);

  return null;
}
