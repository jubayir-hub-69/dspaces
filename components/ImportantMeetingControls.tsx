"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDataChannel,
  useLocalParticipantPermissions,
  useRoomContext,
} from "@dtelecom/components-react";
import {
  parseImportantMeta,
  type ImportantRole,
} from "../lib/important-meetings";

const MEETING_TOPIC = "dspaces-important-meeting";

type RaisedHand = {
  identity: string;
  name: string;
};

type MeetingMessage =
  | { type: "RAISE_HAND"; identity: string; name: string }
  | { type: "HAND_DENIED"; identity: string }
  | { type: "HAND_RESOLVED"; identity: string };

type Person = {
  identity: string;
  name: string;
  isLocal: boolean;
  canPublish: boolean;
  role: ImportantRole;
};

function deriveRole(identity: string, metadata: string | undefined, canPublish: boolean, supremeHostId?: string): ImportantRole {
  const meta = parseImportantMeta(metadata);
  if (meta.role === "supreme_host" || (supremeHostId && identity === supremeHostId) || /\(Host\)\s*$/.test(identity)) {
    return "supreme_host";
  }
  if (meta.isCoHost || meta.role === "cohost") return "cohost";
  if (meta.role === "speaker" || canPublish) return "speaker";
  return "listener";
}

function roleLabel(role: ImportantRole) {
  if (role === "supreme_host") return "Supreme Host";
  if (role === "cohost") return "Co-Host";
  if (role === "speaker") return "Speaker";
  return "Listener";
}

export function ImportantMeetingControls({
  isHost,
  roomId,
  serverUrl,
  showDynamicToast,
}: {
  isHost: boolean;
  roomId: string;
  serverUrl: string;
  showDynamicToast: (msg: string) => void;
}) {
  const room = useRoomContext();
  const permissions = useLocalParticipantPermissions();
  const canPublish = permissions?.canPublish === true;
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [localMetaVersion, setLocalMetaVersion] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const wasPublishRef = useRef(canPublish);
  const wasCoHostRef = useRef(false);
  const roleFxReadyRef = useRef(false);
  const toastRef = useRef(showDynamicToast);
  toastRef.current = showDynamicToast;

  const localMeta = parseImportantMeta(room?.localParticipant?.metadata);
  const isSupremeHost = isHost || localMeta.role === "supreme_host";
  const isCoHostUser = !isSupremeHost && (localMeta.isCoHost || localMeta.role === "cohost");
  const isManager = isSupremeHost || isCoHostUser;

  const snapshotPeople = useCallback(() => {
    if (!room) return;
    const remote = Array.from(room.participants.values());
    const all = [room.localParticipant, ...remote];
    const hostGuess =
      all.find((p) => parseImportantMeta(p.metadata).role === "supreme_host")?.identity ||
      all.find((p) => /\(Host\)\s*$/.test(p.identity))?.identity ||
      (isHost ? room.localParticipant.identity : undefined);

    setPeople(
      all.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        isLocal: p.sid === room.localParticipant.sid,
        canPublish: p.permissions?.canPublish === true,
        role: deriveRole(p.identity, p.metadata, p.permissions?.canPublish === true, hostGuess),
      }))
    );
    setLocalMetaVersion((n) => n + 1);
  }, [room, isHost]);

  useEffect(() => {
    if (!room) return;
    snapshotPeople();
    const bump = () => snapshotPeople();
    room.on("participantConnected", bump);
    room.on("participantDisconnected", bump);
    room.on("participantMetadataChanged", bump);
    room.on("participantPermissionsChanged", bump);
    return () => {
      room.off("participantConnected", bump);
      room.off("participantDisconnected", bump);
      room.off("participantMetadataChanged", bump);
      room.off("participantPermissionsChanged", bump);
    };
  }, [room, snapshotPeople]);

  useEffect(() => {
    if (isManager) {
      document.body.classList.remove("important-listener-locked");
      return;
    }
    document.body.classList.toggle("important-listener-locked", !canPublish);
    return () => document.body.classList.remove("important-listener-locked");
  }, [isManager, canPublish]);

  useEffect(() => {
    if (!roleFxReadyRef.current) {
      roleFxReadyRef.current = true;
      wasPublishRef.current = canPublish;
      wasCoHostRef.current = isCoHostUser;
      return;
    }

    if (isSupremeHost) {
      wasPublishRef.current = canPublish;
      wasCoHostRef.current = false;
      return;
    }

    if (canPublish && !wasPublishRef.current) {
      setHandRaised(false);
      toastRef.current("The host allowed you to speak. You can now unmute your microphone.");
    }

    if (wasPublishRef.current && !canPublish) {
      setHandRaised(false);
      try {
        room?.localParticipant?.setMicrophoneEnabled(false);
        room?.localParticipant?.setCameraEnabled(false);
        room?.localParticipant?.setScreenShareEnabled(false);
      } catch {
        // Ignore if tracks cannot be unpublished locally.
      }
      toastRef.current("You were moved back to listener. Raise your hand to request the mic.");
    }

    if (isCoHostUser && !wasCoHostRef.current) {
      toastRef.current("You are now a co-host. You can manage the stage.");
    }

    if (wasCoHostRef.current && !isCoHostUser) {
      toastRef.current("You are no longer a co-host.");
    }

    wasPublishRef.current = canPublish;
    wasCoHostRef.current = isCoHostUser;
  }, [canPublish, isSupremeHost, isCoHostUser, room, localMetaVersion]);

  const { send } = useDataChannel(MEETING_TOPIC);

  const sendMessage = useCallback(
    (msg: MeetingMessage) => {
      send(new TextEncoder().encode(JSON.stringify(msg)), {});
    },
    [send]
  );

  useEffect(() => {
    if (!room) return;

    const handleData = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic && topic !== MEETING_TOPIC && topic !== "dspaces-raise-hand") return;
      try {
        const decoded = JSON.parse(new TextDecoder().decode(payload)) as MeetingMessage;
        if (decoded?.type === "RAISE_HAND" && decoded.identity) {
          if (!isManager) return;
          setRaisedHands((prev) => {
            if (prev.some((hand) => hand.identity === decoded.identity)) return prev;
            return [...prev, { identity: decoded.identity, name: decoded.name || decoded.identity }];
          });
          toastRef.current(`${decoded.name || decoded.identity} raised their hand`);
          return;
        }
        if (decoded?.type === "HAND_RESOLVED" && decoded.identity) {
          setRaisedHands((prev) => prev.filter((hand) => hand.identity !== decoded.identity));
          return;
        }
        if (decoded?.type === "HAND_DENIED" && decoded.identity) {
          setRaisedHands((prev) => prev.filter((hand) => hand.identity !== decoded.identity));
          if (decoded.identity === room.localParticipant.identity) {
            setHandRaised(false);
            toastRef.current("Your request to speak was denied.");
          }
        }
      } catch {
        // Ignore non-JSON data channel payloads (e.g. chat).
      }
    };

    room.on("dataReceived", handleData);
    return () => {
      room.off("dataReceived", handleData);
    };
  }, [room, isManager]);

  const raiseHand = useCallback(() => {
    if (!room?.localParticipant || handRaised) return;
    const payload: MeetingMessage = {
      type: "RAISE_HAND",
      identity: room.localParticipant.identity,
      name: room.localParticipant.name || room.localParticipant.identity,
    };
    sendMessage(payload);
    setHandRaised(true);
    showDynamicToast("Hand raised. Waiting for the host to allow you to speak.");
  }, [room, sendMessage, handRaised, showDynamicToast]);

  const runAction = useCallback(
    async (identity: string, action: "allow" | "demote" | "make-cohost", successMsg: string) => {
      setBusyIdentity(`${action}:${identity}`);
      try {
        const res = await fetch("/api/update-participant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: roomId,
            identity,
            serverUrl,
            action,
            actorIdentity: room?.localParticipant?.identity,
          }),
        });
        const data = await res.json();
        if (data.success) {
          if (action === "allow" || action === "demote") {
            setRaisedHands((prev) => prev.filter((hand) => hand.identity !== identity));
            sendMessage({ type: "HAND_RESOLVED", identity });
          }
          showDynamicToast(successMsg);
          snapshotPeople();
        } else {
          showDynamicToast(data.error || "Failed to update participant.");
        }
      } catch {
        showDynamicToast("Failed to update participant.");
      } finally {
        setBusyIdentity(null);
      }
    },
    [roomId, serverUrl, room, showDynamicToast, sendMessage, snapshotPeople]
  );

  const denyHand = useCallback(
    (identity: string) => {
      setRaisedHands((prev) => prev.filter((hand) => hand.identity !== identity));
      sendMessage({ type: "HAND_DENIED", identity });
      sendMessage({ type: "HAND_RESOLVED", identity });
      showDynamicToast(`Denied ${identity}`);
    },
    [sendMessage, showDynamicToast]
  );

  const remotes = people.filter((p) => !p.isLocal);

  useEffect(() => {
    if (raisedHands.length > 0) setPanelOpen(true);
  }, [raisedHands.length]);

  return (
    <>
      {isManager && (
        <>
          <div className="important-meeting-dock">
            <button
              type="button"
              onClick={() => setPanelOpen((open) => !open)}
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-xl shadow-lg shadow-indigo-500/20 transition-all hover:border-cyan-400/40 hover:shadow-cyan-500/20"
            >
              Participants{raisedHands.length > 0 ? ` (${raisedHands.length})` : ""}
            </button>
          </div>
          {panelOpen && (
            <div className="important-meeting-sidebar rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl shadow-2xl shadow-indigo-500/10">
              <div className="important-meeting-sidebar-header">
                <strong>Participants</strong>
                <button type="button" onClick={() => setPanelOpen(false)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-300 transition-all hover:text-white hover:border-white/30">Close</button>
              </div>
              {raisedHands.length > 0 && (
                <div className="important-meeting-sidebar-section">
                  <div className="important-meeting-sidebar-title">Raised hands</div>
                  {raisedHands.map((hand) => (
                    <div key={hand.identity} className="important-meeting-sidebar-row">
                      <div>{hand.name}</div>
                      <button
                        type="button"
                        disabled={busyIdentity === `allow:${hand.identity}`}
                        onClick={() => runAction(hand.identity, "allow", `Allowed ${hand.name} to speak`)}
                        className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-1.5 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 transition-all hover:shadow-emerald-500/40 disabled:opacity-60"
                      >
                        {busyIdentity === `allow:${hand.identity}` ? "Allowing..." : "Allow"}
                      </button>{" "}
                      <button type="button" onClick={() => denyHand(hand.identity)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-200 transition-all hover:border-red-400/40 hover:text-white">
                        Deny
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="important-meeting-sidebar-section">
                {remotes.length === 0 && <div>No other participants yet.</div>}
                {remotes.map((person) => (
                  <div key={person.identity} className="important-meeting-sidebar-row">
                    {person.name} [{roleLabel(person.role)}]
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!isManager && !canPublish && (
        <div className="important-meeting-dock">
          <button
            type="button"
            onClick={raiseHand}
            disabled={handRaised}
            className="rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/40 disabled:from-slate-600 disabled:to-slate-600 disabled:text-white disabled:border-white/10"
          >
            {handRaised ? "Hand Raised" : "Raise Hand"}
          </button>
        </div>
      )}
    </>
  );
}
