"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ReceivedChatMessage } from "@dtelecom/components-react";
import { useRoomContext } from "@dtelecom/components-react";

type IdentifiedChatEntryProps = {
  entry?: ReceivedChatMessage;
  messageFormatter?: (message: string) => ReactNode;
};

const cleanParticipantName = (value: string) =>
  value.replace(/\s*\(You\)\s*$/i, "").replace(/\s*\(Host\)\s*$/i, "").trim();

function lookupAvatar(displayName: string) {
  const clean = cleanParticipantName(displayName);
  try {
    const cached = (window as unknown as { __dspacesAvatars?: Record<string, string> }).__dspacesAvatars || {};
    if (cached[clean]) return cached[clean];
    if (cached[displayName]) return cached[displayName];

    const db = JSON.parse(localStorage.getItem("dspaces_db") || "[]");
    const user = db.find((item: { name?: string; avatar?: string }) => item.name === clean || item.name === displayName);
    if (user?.avatar) return user.avatar as string;
  } catch {
    // localStorage may be unavailable
  }
  return "";
}

function SenderAvatar({ name, avatar }: { name: string; avatar: string }) {
  if (avatar.startsWith("data:image") || avatar.startsWith("http")) {
    return (
      <img
        src={avatar}
        alt=""
        className="h-7 w-7 rounded-full object-cover border border-cyan-400/40 shadow-[0_0_8px_rgba(0,229,255,0.25)]"
      />
    );
  }
  const letter = (cleanParticipantName(name) || "?").charAt(0).toUpperCase();
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-[11px] font-black text-white">
      {letter}
    </span>
  );
}

export function IdentifiedChatEntry({ entry, messageFormatter }: IdentifiedChatEntryProps) {
  const room = useRoomContext();
  const participant = entry?.from;
  const localIdentity = room?.localParticipant?.identity;

  const displayName = useMemo(() => {
    const raw = (participant?.name || participant?.identity || "").trim();
    if (raw) return raw;
    if (participant?.identity === localIdentity) {
      return (room.localParticipant.name || room.localParticipant.identity || "You").trim();
    }
    return "Guest";
  }, [participant?.name, participant?.identity, localIdentity, room?.localParticipant]);

  const [avatarTick, setAvatarTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setAvatarTick((value) => value + 1), 4000);
    return () => window.clearInterval(id);
  }, []);
  const avatar = useMemo(() => lookupAvatar(displayName), [displayName, avatarTick]);
  const isLocal = participant?.identity === localIdentity;
  const formattedMessage = messageFormatter && entry?.message ? messageFormatter(entry.message) : entry?.message;
  const time = entry?.timestamp ? new Date(entry.timestamp) : null;

  if (!entry) return null;

  return (
    <li
      className={`lk-chat-entry dspaces-identified-entry flex flex-col gap-1.5 mx-3 ${isLocal ? "items-end" : "items-start"}`}
      data-lk-message-origin={isLocal ? "local" : "remote"}
    >
      <div className={`flex items-center gap-2 ${isLocal ? "flex-row-reverse" : "flex-row"}`}>
        <SenderAvatar name={displayName} avatar={avatar} />
        <div className={`flex flex-col ${isLocal ? "items-end" : "items-start"}`}>
          <strong className="text-xs font-bold text-white leading-tight">{displayName}</strong>
          {time && (
            <span className="text-[10px] text-gray-500">
              {time.toLocaleTimeString(undefined, { timeStyle: "short" })}
            </span>
          )}
        </div>
      </div>
      <span className="lk-message-body max-w-[85%] text-sm">{formattedMessage}</span>
    </li>
  );
}
