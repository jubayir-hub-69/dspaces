"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDataChannel, useParticipants, useRoomContext } from "@dtelecom/components-react";
import { initialFromAccount, initialsAvatarHtml, isImageAvatar } from "../lib/account";
import {
  CHAT_TRANSCRIPTION_TOPIC,
  parseParticipantMeta,
  TRANSCRIPT_TOPIC,
  type TranscriptSegment,
} from "../lib/types";

export function ParticipantAvatarSync({ fallbackAvatars }: { fallbackAvatars: Record<string, string> }) {
  const participants = useParticipants();

  useEffect(() => {
    const tiles = document.querySelectorAll(".lk-participant-tile, [data-important-tile]");
    tiles.forEach((tile) => {
      const nameEl = tile.querySelector(".lk-participant-name") || tile.querySelector(".absolute.bottom-0");
      const placeholder = tile.querySelector(".lk-participant-placeholder") || tile.querySelector(".absolute.inset-0.flex");
      if (!nameEl || !placeholder) return;

      const tileName = (nameEl.textContent || "").replace(" (Host)", "").replace(" (You)", "").trim();
      const participant = participants.find((p) => {
        const label = (p.name || p.identity || "").replace(" (Host)", "").replace(" (You)", "").trim();
        return label === tileName || p.identity === tileName;
      });
      const meta = parseParticipantMeta(participant?.metadata);
      const mapped = meta.avatar || fallbackAvatars[tileName] || "";
      const avatar = isImageAvatar(mapped) ? mapped : `initial:${initialFromAccount(tileName)}`;
      if (placeholder.getAttribute("data-avatar") === avatar && placeholder.querySelector(".custom-avatar")) {
        return;
      }
      placeholder.setAttribute("data-avatar", avatar);
      if (isImageAvatar(mapped)) {
        placeholder.innerHTML = `<img src="${mapped}" class="custom-avatar" alt="" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e5ff; box-shadow: 0 0 25px rgba(0,229,255,0.4);" />`;
      } else {
        placeholder.innerHTML = initialsAvatarHtml(tileName, 120);
      }
    });
  }, [participants, fallbackAvatars]);

  return null;
}

function parseTranscriptPayload(payload: Uint8Array): (TranscriptSegment & { type?: string }) | null {
  try {
    const decoded = JSON.parse(new TextDecoder().decode(payload)) as TranscriptSegment & {
      type?: string;
      transcript?: string;
      message?: string;
      from?: string;
      timestamp?: number;
    };
    const text = (decoded.text || decoded.transcript || decoded.message || "").trim();
    if (!text) return null;
    if (decoded.type && decoded.type !== "transcript" && decoded.type !== "transcription") {
      return null;
    }
    return {
      type: decoded.type || "transcript",
      speaker: decoded.speaker || decoded.from || "Participant",
      text,
      at: decoded.at || decoded.timestamp || Date.now(),
      isFinal: decoded.isFinal !== false,
    };
  } catch {
    return null;
  }
}

export function TranscriptListener({
  onSegment,
  roomId,
}: {
  onSegment: (segment: TranscriptSegment, fullText: string) => void;
  roomId?: string;
}) {
  const room = useRoomContext();
  const fullRef = useRef("");
  const seenRef = useRef(new Set<string>());
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;

  const ingest = useCallback((segment: TranscriptSegment) => {
    const key = `${segment.at}:${segment.speaker}:${segment.text}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);
    const line = segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text;
    if (segment.isFinal !== false) {
      fullRef.current = `${fullRef.current} ${line}`.trim();
    }
    onSegmentRef.current(segment, fullRef.current);
  }, []);

  const handlePacket = useCallback(
    (payload: Uint8Array, topic?: string) => {
      if (topic && topic !== TRANSCRIPT_TOPIC && topic !== CHAT_TRANSCRIPTION_TOPIC) return;
      const decoded = parseTranscriptPayload(payload);
      if (!decoded) return;
      ingest(decoded);
    },
    [ingest]
  );

  const onDataMessage = useCallback(
    (msg: { payload: Uint8Array; topic?: string }) => {
      handlePacket(msg.payload, msg.topic);
    },
    [handlePacket]
  );

  useDataChannel(TRANSCRIPT_TOPIC, onDataMessage);
  useDataChannel(onDataMessage);

  useEffect(() => {
    if (!room) return;
    const handleData = (payload: Uint8Array, _p?: unknown, _kind?: unknown, topic?: string) => {
      handlePacket(payload, topic);
    };
    room.on("dataReceived", handleData);
    return () => {
      room.off("dataReceived", handleData);
    };
  }, [handlePacket, room]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/transcription-agent?room=${encodeURIComponent(roomId)}`);
        const data = (await res.json()) as { transcript?: string; segments?: TranscriptSegment[] };
        if (cancelled) return;
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          for (const segment of data.segments) {
            if (segment?.text) ingest(segment);
          }
        } else if (data.transcript && !fullRef.current) {
          fullRef.current = data.transcript;
          onSegmentRef.current(
            { speaker: "Room", text: data.transcript, at: Date.now(), isFinal: true },
            data.transcript
          );
        }
      } catch {
        // Hydration is best-effort; live data channel packets still apply.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ingest, roomId]);

  return null;
}
