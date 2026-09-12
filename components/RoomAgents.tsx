"use client";

import { useEffect, useRef } from "react";
import { useParticipants, useRoomContext } from "@dtelecom/components-react";
import { initialFromAccount, initialsAvatarHtml, isImageAvatar } from "../lib/account";
import { parseParticipantMeta, TRANSCRIPT_TOPIC, type TranscriptSegment } from "../lib/types";

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

export function TranscriptListener({
  onSegment,
}: {
  onSegment: (segment: TranscriptSegment, fullText: string) => void;
}) {
  const room = useRoomContext();
  const fullRef = useRef("");
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;

  useEffect(() => {
    if (!room) return;
    const handleData = (payload: Uint8Array, _p?: unknown, _kind?: unknown, topic?: string) => {
      if (topic && topic !== TRANSCRIPT_TOPIC) return;
      try {
        const decoded = JSON.parse(new TextDecoder().decode(payload)) as TranscriptSegment & { type?: string };
        if (!decoded?.text) return;
        const line = decoded.speaker ? `${decoded.speaker}: ${decoded.text}` : decoded.text;
        if (decoded.isFinal !== false) {
          fullRef.current = `${fullRef.current} ${line}`.trim();
        }
        onSegmentRef.current(
          {
            speaker: decoded.speaker || "Participant",
            text: decoded.text,
            at: decoded.at || Date.now(),
            isFinal: decoded.isFinal !== false,
          },
          fullRef.current
        );
      } catch {
        // Ignore unrelated data messages.
      }
    };
    room.on("dataReceived", handleData);
    return () => {
      room.off("dataReceived", handleData);
    };
  }, [room]);

  return null;
}
