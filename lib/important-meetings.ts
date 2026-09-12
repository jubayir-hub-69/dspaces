import {
  getRoomState,
  isRoomCoHost,
  isRoomHost,
  saveRoomState,
  updateRoomState,
} from "./room-store";
import type { MeetingRole, ParticipantMeta } from "./types";
import { parseParticipantMeta, serializeParticipantMeta } from "./types";

export type ImportantRole = Extract<MeetingRole, "supreme_host" | "cohost" | "speaker" | "listener">;

export type ImportantMeta = ParticipantMeta;

export { parseParticipantMeta as parseImportantMeta, serializeParticipantMeta as serializeImportantMeta };

export async function markImportantRoom(room: string) {
  const current = await getRoomState(room);
  if (!current) return;
  if (current.mode === "important") return;
  await saveRoomState(room, { ...current, mode: "important" });
}

export async function isImportantRoom(room: string) {
  const current = await getRoomState(room);
  return current?.mode === "important";
}

export async function setRoomHost(room: string, identity: string) {
  const current = await getRoomState(room);
  if (!current) return;
  if (current.hostId && current.hostId !== identity) return;
  await saveRoomState(room, { ...current, hostId: identity });
}

export async function getRoomHost(room: string) {
  const current = await getRoomState(room);
  return current?.hostId;
}

export async function allowSpeaker(room: string, identity: string) {
  await updateRoomState(room, (current) => {
    const speakers = current.speakers.includes(identity)
      ? current.speakers
      : [...current.speakers, identity];
    return { ...current, speakers };
  });
}

export async function revokeSpeaker(room: string, identity: string) {
  await updateRoomState(room, (current) => ({
    ...current,
    speakers: current.speakers.filter((id) => id !== identity),
    coHosts: current.coHosts.filter((id) => id !== identity),
  }));
}

export async function isAllowedSpeaker(room: string, identity: string) {
  const current = await getRoomState(room);
  return current?.speakers.includes(identity) === true;
}

export async function addCoHost(room: string, identity: string) {
  await updateRoomState(room, (current) => {
    const coHosts = current.coHosts.includes(identity)
      ? current.coHosts
      : [...current.coHosts, identity];
    const speakers = current.speakers.includes(identity)
      ? current.speakers
      : [...current.speakers, identity];
    return { ...current, coHosts, speakers };
  });
}

export async function removeCoHost(room: string, identity: string) {
  await updateRoomState(room, (current) => ({
    ...current,
    coHosts: current.coHosts.filter((id) => id !== identity),
  }));
}

export async function isCoHost(room: string, identity: string) {
  const current = await getRoomState(room);
  return isRoomCoHost(current, identity);
}

export async function actorIsHost(room: string, identity: string) {
  const current = await getRoomState(room);
  return isRoomHost(current, identity);
}
