"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat, useRoomContext, type IUseChat } from "@dtelecom/components-react";
import type { Participant } from "@dtelecom/livekit-client";
import { CHAT_TOPIC, type RoomChatMessage } from "../lib/types";

function messageKey(identity: string, message: string, timestamp: number) {
  return `${timestamp}:${identity}:${message}`;
}

export function usePersistentChat(roomId: string, token: string): IUseChat {
  const chat = useChat();
  const room = useRoomContext();
  const restoredRef = useRef(false);
  const seenRef = useRef(new Set<string>());

  const persist = useCallback(
    async (msg: Pick<RoomChatMessage, "identity" | "name" | "message" | "timestamp">) => {
      if (!roomId || !token || !msg.message?.trim()) return;
      const key = messageKey(msg.identity, msg.message, msg.timestamp);
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      try {
        await fetch("/api/room-chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ room: roomId, ...msg }),
        });
      } catch {
        seenRef.current.delete(key);
      }
    },
    [roomId, token]
  );

  useEffect(() => {
    if (!roomId || !token || restoredRef.current || !chat.addLocalMessage) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/room-chat?room=${encodeURIComponent(roomId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { messages?: RoomChatMessage[] };
        if (cancelled || !Array.isArray(data.messages)) {
          restoredRef.current = true;
          return;
        }
        restoredRef.current = true;
        for (const msg of data.messages) {
          const key = messageKey(msg.identity, msg.message, msg.timestamp);
          seenRef.current.add(key);
          const from = {
            identity: msg.identity,
            name: msg.name || msg.identity,
            metadata: "",
          } as Participant;
          chat.addLocalMessage?.(msg.message, from, CHAT_TOPIC, msg.timestamp, "text");
        }
      } catch {
        restoredRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chat.addLocalMessage, roomId, token]);

  const send = useCallback(
    async (message: string) => {
      await chat.send?.(message);
      const identity = room?.localParticipant?.identity || "";
      const name = room?.localParticipant?.name || identity;
      await persist({
        identity,
        name,
        message,
        timestamp: Date.now(),
      });
    },
    [chat, persist, room]
  );

  useEffect(() => {
    if (!room) return;
    const handleData = (
      payload: Uint8Array,
      participant?: { identity?: string; name?: string },
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic && topic !== CHAT_TOPIC) return;
      try {
        const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
          message?: string;
          timestamp?: number;
          type?: string;
        };
        if (!parsed.message || parsed.type === "transcription") return;
        void persist({
          identity: participant?.identity || room.localParticipant?.identity || "unknown",
          name: participant?.name || participant?.identity || "Guest",
          message: parsed.message,
          timestamp: parsed.timestamp || Date.now(),
        });
      } catch {
        // Ignore unrelated data packets.
      }
    };
    room.on("dataReceived", handleData);
    return () => {
      room.off("dataReceived", handleData);
    };
  }, [persist, room]);

  return {
    ...chat,
    send,
  };
}
