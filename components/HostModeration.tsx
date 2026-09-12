"use client";

import { useCallback, useMemo } from "react";
import { useLocalParticipant } from "@dtelecom/components-react";
import { RoomVideoConference } from "./RoomVideoConference";
import { kickParticipant, muteParticipant } from "../lib/moderation-client";
import { isHostRole, isManagerRole, parseParticipantMeta } from "../lib/types";

export function HostModeration({
  token,
  roomId,
  serverUrl,
  isAdmin,
  showDynamicToast,
}: {
  token: string;
  roomId: string;
  serverUrl: string;
  isAdmin: boolean;
  showDynamicToast: (msg: string) => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const localMeta = useMemo(
    () => parseParticipantMeta(localParticipant?.metadata),
    [localParticipant?.metadata]
  );
  const canModerate = isAdmin || isManagerRole(localMeta.role) || isHostRole(localMeta.role);

  const onKick = useCallback(
    async (identity: string) => {
      try {
        await kickParticipant({ room: roomId, identity, token, serverUrl });
        showDynamicToast(`Removed ${identity} from the room`);
      } catch (error: unknown) {
        showDynamicToast(error instanceof Error ? error.message : "Failed to remove participant.");
      }
    },
    [roomId, token, serverUrl, showDynamicToast]
  );

  const onMute = useCallback(
    async (identity: string, trackSid: string, type?: "audio" | "video") => {
      try {
        await muteParticipant({ room: roomId, identity, token, serverUrl, trackSid, type });
        showDynamicToast(`Muted ${identity}`);
      } catch (error: unknown) {
        showDynamicToast(error instanceof Error ? error.message : "Failed to mute participant.");
      }
    },
    [roomId, token, serverUrl, showDynamicToast]
  );

  return (
    <RoomVideoConference
      isAdmin={canModerate}
      localIdentity={localParticipant?.identity}
      onKick={canModerate ? onKick : undefined}
      onMute={canModerate ? onMute : undefined}
      aiAgentEnabled
    />
  );
}
