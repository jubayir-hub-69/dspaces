import { isKvConfigured, kvGet, kvSet } from "./kv";
import type { MeetingRole, RoomMode, RoomState, TranscriptSegment } from "./types";

const AVATARS_KEY = "dspaces_avatars";

function roomKey(room: string) {
  return `dspaces_room_${room}`;
}

function emptyRoom(hostId: string, mode: RoomMode): RoomState {
  return {
    hostId,
    mode,
    coHosts: [],
    speakers: [],
    avatars: {},
    transcript: "",
    transcriptSegments: [],
    agentActive: false,
    createdAt: Date.now(),
  };
}

export async function getRoomState(room: string): Promise<RoomState | null> {
  if (!isKvConfigured()) return null;
  return kvGet<RoomState>(roomKey(room));
}

export async function saveRoomState(room: string, state: RoomState): Promise<RoomState> {
  if (!isKvConfigured()) {
    throw new Error("DB not connected");
  }
  await kvSet(roomKey(room), state);
  return state;
}

export async function createRoomState(room: string, hostId: string, mode: RoomMode): Promise<RoomState> {
  const existing = await getRoomState(room);
  if (existing?.hostId) {
    return existing;
  }
  return saveRoomState(room, emptyRoom(hostId, mode));
}

export async function updateRoomState(
  room: string,
  patch: (current: RoomState) => RoomState | Promise<RoomState>
): Promise<RoomState> {
  const current = (await getRoomState(room)) || emptyRoom("", "standard");
  const next = await patch(current);
  return saveRoomState(room, next);
}

export async function getGlobalAvatars(): Promise<Record<string, string>> {
  if (!isKvConfigured()) return {};
  return (await kvGet<Record<string, string>>(AVATARS_KEY)) || {};
}

export async function upsertGlobalAvatar(name: string, avatar: string): Promise<Record<string, string>> {
  const avatars = await getGlobalAvatars();
  if (name && avatar) {
    avatars[name] = avatar;
    if (isKvConfigured()) {
      await kvSet(AVATARS_KEY, avatars);
    }
  }
  return avatars;
}

export function isRoomHost(state: RoomState | null, identity: string): boolean {
  return !!state?.hostId && state.hostId === identity;
}

export function isRoomCoHost(state: RoomState | null, identity: string): boolean {
  return !!state && state.coHosts.includes(identity);
}

export function isRoomManager(state: RoomState | null, identity: string): boolean {
  return isRoomHost(state, identity) || isRoomCoHost(state, identity);
}

export function roleForParticipant(state: RoomState | null, identity: string, important: boolean): MeetingRole {
  if (!state) return important ? "listener" : "guest";
  if (state.hostId === identity) return important ? "supreme_host" : "host";
  if (state.coHosts.includes(identity)) return "cohost";
  if (important) {
    return state.speakers.includes(identity) ? "speaker" : "listener";
  }
  return "guest";
}

export async function appendTranscript(room: string, segment: TranscriptSegment): Promise<RoomState | null> {
  const current = await getRoomState(room);
  if (!current) return null;
  const line = segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text;
  const transcript = segment.isFinal
    ? `${current.transcript} ${line}`.trim()
    : current.transcript;
  const segments = [...current.transcriptSegments, segment].slice(-400);
  return saveRoomState(room, { ...current, transcript, transcriptSegments: segments });
}
