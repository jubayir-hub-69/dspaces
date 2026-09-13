"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  Chat,
  ControlBar,
  LayoutContextProvider,
  ParticipantLoop,
  RoomAudioRenderer,
  VideoTrack,
  useCreateLayoutContext,
  useParticipantContext,
  useParticipants,
  useRoomContext,
} from "@dtelecom/components-react";
import { RoomEvent, Track } from "@dtelecom/livekit-client";
import { parseImportantMeta, type ImportantRole } from "../lib/important-meetings";
import { kickParticipant, muteParticipant, updateStageParticipant } from "../lib/moderation-client";
import { isAiAgent, isHostRole, isManagerRole } from "../lib/types";
import { IdentifiedChatEntry } from "./IdentifiedChatEntry";
import { usePersistentChat } from "./PersistentChat";

function subscribePublication(pub: { setSubscribed?: (v: boolean) => void; isSubscribed?: boolean }) {
  if (typeof pub?.setSubscribed !== "function") return;
  if (pub.isSubscribed) return;
  try {
    pub.setSubscribed(true);
  } catch {
    // Ignore subscribe races while the participant is connecting.
  }
}

function displayName(identity: string, name?: string) {
  return (name || identity).replace(" (You)", "").trim();
}

function initialsFor(label: string) {
  const clean = label.replace(" (Host)", "").replace(" (You)", "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const letters = ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  return letters;
}

function avatarFor(label: string, metadata?: string) {
  const fromMeta = parseImportantMeta(metadata).avatar;
  if (fromMeta) return fromMeta;
  try {
    const clean = label.replace(" (Host)", "").replace(" (You)", "").trim();
    const db = JSON.parse(localStorage.getItem("dspaces_db") || "[]") as Array<{ name?: string; avatar?: string }>;
    const hit = db.find((u) => u.name === clean);
    return hit?.avatar || null;
  } catch {
    return null;
  }
}

function deriveRole(identity: string, metadata: string | undefined, canPublish: boolean, supremeHostId?: string): ImportantRole {
  const meta = parseImportantMeta(metadata);
  if (meta.role === "supreme_host" || (supremeHostId && identity === supremeHostId) || /\(Host\)\s*$/.test(identity)) {
    return "supreme_host";
  }
  if (meta.isCoHost || meta.role === "cohost") return "cohost";
  if (meta.role === "speaker" || canPublish) return "speaker";
  return "listener";
}

type StageActions = {
  isHost: boolean;
  roomId: string;
  serverUrl: string;
  token: string;
  showDynamicToast: (msg: string) => void;
};

const StageActionsContext = createContext<StageActions | null>(null);

function TileHostMenu({
  identity,
  name,
  role,
}: {
  identity: string;
  name: string;
  role: ImportantRole;
}) {
  const room = useRoomContext();
  const actions = useContext(StageActionsContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  if (!actions) return null;

  const local = room.localParticipant;
  const localMeta = parseImportantMeta(local.metadata);
  const isSupremeHost = actions.isHost || isHostRole(localMeta.role);
  const isCoHostUser = !isSupremeHost && (localMeta.isCoHost || isManagerRole(localMeta.role));
  const isLocal = identity === local.identity;
  if (isLocal) return null;
  if (role === "supreme_host") return null;
  if (!isSupremeHost && !isCoHostUser) return null;
  if (isCoHostUser && role === "cohost") return null;

  const isSpeakerLike = role === "speaker" || role === "cohost";

  const runAction = async (action: "demote" | "make-cohost", successMsg: string) => {
    setBusy(action);
    try {
      await updateStageParticipant({
        room: actions.roomId,
        identity,
        token: actions.token,
        serverUrl: actions.serverUrl,
        action,
      });
      actions.showDynamicToast(successMsg);
      setOpen(false);
    } catch (error: unknown) {
      actions.showDynamicToast(error instanceof Error ? error.message : "Failed to update participant.");
    } finally {
      setBusy("");
    }
  };

  const runMute = async () => {
    setBusy("mute");
    try {
      const participant = room.getParticipantByIdentity(identity);
      const audio = participant?.getTrack(Track.Source.Microphone);
      await muteParticipant({
        room: actions.roomId,
        identity,
        token: actions.token,
        serverUrl: actions.serverUrl,
        trackSid: audio?.trackSid,
        type: "audio",
      });
      actions.showDynamicToast(`Muted ${name}`);
      setOpen(false);
    } catch (error: unknown) {
      actions.showDynamicToast(error instanceof Error ? error.message : "Failed to mute participant.");
    } finally {
      setBusy("");
    }
  };

  const runKick = async () => {
    setBusy("kick");
    try {
      await kickParticipant({
        room: actions.roomId,
        identity,
        token: actions.token,
        serverUrl: actions.serverUrl,
      });
      actions.showDynamicToast(`Removed ${name} from the room`);
      setOpen(false);
    } catch (error: unknown) {
      actions.showDynamicToast(error instanceof Error ? error.message : "Failed to remove participant.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="absolute top-2 right-2 z-20">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 bg-black/70 text-white shadow-lg shadow-black/30 transition-all hover:border-cyan-400/40 hover:bg-black/80"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Participant controls"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 min-w-[150px] rounded-2xl border border-white/10 bg-slate-950/95 p-1 shadow-2xl shadow-indigo-500/20 backdrop-blur-xl">
          {isSpeakerLike && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-white"
              disabled={busy === "demote"}
              onClick={() => runAction("demote", `Demoted ${name}`)}
            >
              {busy === "demote" ? "Demoting..." : "Demote"}
            </button>
          )}
          {isSupremeHost && role !== "cohost" && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-white"
              disabled={busy === "make-cohost"}
              onClick={() => runAction("make-cohost", `Made ${name} a co-host`)}
            >
              {busy === "make-cohost" ? "Updating..." : "Make Co-Host"}
            </button>
          )}
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-white"
            disabled={busy === "mute"}
            onClick={() => void runMute()}
          >
            {busy === "mute" ? "Muting..." : "Mute"}
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-red-300"
            disabled={busy === "kick"}
            onClick={() => void runKick()}
          >
            {busy === "kick" ? "Removing..." : "Kick"}
          </button>
        </div>
      )}
    </div>
  );
}

function ImportantParticipantTile({ supremeHostId }: { supremeHostId?: string }) {
  const participant = useParticipantContext();
  const [mediaTick, setMediaTick] = useState(0);
  const label = displayName(participant.identity, participant.name);
  const avatar = avatarFor(label, participant.metadata);
  const role = deriveRole(
    participant.identity,
    participant.metadata,
    participant.permissions?.canPublish === true,
    supremeHostId
  );

  useEffect(() => {
    const bump = () => setMediaTick((n) => n + 1);
    participant.on("trackMuted", bump);
    participant.on("trackUnmuted", bump);
    participant.on("trackSubscribed", bump);
    participant.on("trackPublished", bump);
    return () => {
      participant.off("trackMuted", bump);
      participant.off("trackUnmuted", bump);
      participant.off("trackSubscribed", bump);
      participant.off("trackPublished", bump);
    };
  }, [participant]);

  void mediaTick;
  const camera = participant.getTrack(Track.Source.Camera);
  const screen = participant.getTrack(Track.Source.ScreenShare);
  const hasScreen = !!(screen?.track && !screen.isMuted);
  const hasCamera = !!(camera?.track && !camera.isMuted);
  const videoSource = hasScreen ? Track.Source.ScreenShare : Track.Source.Camera;
  const showVideo = hasScreen || hasCamera;

  return (
    <div
      data-important-tile={participant.identity}
      className="relative h-full min-h-[200px] w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900"
    >
      {showVideo ? (
        <VideoTrack
          participant={participant}
          source={videoSource}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          {avatar && String(avatar).startsWith("data:image") ? (
            <img
              src={avatar}
              alt=""
              className="h-24 w-24 rounded-full border-2 border-cyan-400 object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 text-3xl font-bold text-white">
              {initialsFor(label)}
            </div>
          )}
        </div>
      )}

      <TileHostMenu identity={participant.identity} name={label} role={role} />

      <div className="absolute bottom-0 left-0 right-0 z-10 truncate bg-black/65 px-3 py-2 text-sm text-white">
        {label}
      </div>
    </div>
  );
}

export function ImportantMeetingStage({
  isHost,
  roomId,
  serverUrl,
  token,
  showDynamicToast,
}: {
  isHost: boolean;
  roomId: string;
  serverUrl: string;
  token: string;
  showDynamicToast: (msg: string) => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants().filter((p) => !isAiAgent(p));
  const layoutContext = useCreateLayoutContext({
    initialWidgetState: { showChat: false, unreadMessages: 0, unreadTranscriptions: 0 },
  });
  const [showChat, setShowChat] = useState(false);
  const chatContext = usePersistentChat(roomId, token);

  const subscribeAll = useCallback(() => {
    if (!room) return;
    room.participants.forEach((participant) => {
      participant.tracks.forEach((pub) => subscribePublication(pub));
    });
  }, [room]);

  useEffect(() => {
    if (!room) return;
    subscribeAll();
    const onPublished = (pub: { setSubscribed?: (v: boolean) => void }) => subscribePublication(pub);
    room.on(RoomEvent.TrackPublished, onPublished);
    room.on(RoomEvent.ParticipantConnected, subscribeAll);
    room.on(RoomEvent.Connected, subscribeAll);
    room.on(RoomEvent.TrackSubscribed, subscribeAll);
    return () => {
      room.off(RoomEvent.TrackPublished, onPublished);
      room.off(RoomEvent.ParticipantConnected, subscribeAll);
      room.off(RoomEvent.Connected, subscribeAll);
      room.off(RoomEvent.TrackSubscribed, subscribeAll);
    };
  }, [room, subscribeAll]);

  const supremeHostId =
    participants.find((p) => parseImportantMeta(p.metadata).role === "supreme_host")?.identity ||
    participants.find((p) => /\(Host\)\s*$/.test(p.identity))?.identity ||
    (isHost ? room.localParticipant.identity : undefined);

  return (
    <StageActionsContext.Provider value={{ isHost, roomId, serverUrl, token, showDynamicToast }}>
      <div className="lk-video-conference important-meeting-stage">
        <LayoutContextProvider
          value={layoutContext}
          onWidgetChange={(state) => setShowChat(!!state.showChat)}
        >
          <div className="lk-video-conference-inner">
            <div className="important-meeting-grid-wrap">
              {participants.length === 0 ? (
                <div className="important-meeting-waiting">Waiting for participants…</div>
              ) : (
                <div className="important-meeting-grid">
                  <ParticipantLoop participants={participants}>
                    <ImportantParticipantTile supremeHostId={supremeHostId} />
                  </ParticipantLoop>
                </div>
              )}
            </div>
            <ControlBar controls={{ chat: true }} isAdmin={isHost} />
          </div>
          <Chat chatContext={chatContext} style={{ display: showChat ? "flex" : "none" }}>
            <IdentifiedChatEntry />
          </Chat>
        </LayoutContextProvider>
        <RoomAudioRenderer />
      </div>
    </StageActionsContext.Provider>
  );
}
