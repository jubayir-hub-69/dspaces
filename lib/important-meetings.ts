/** In-memory registry for Important Meeting rooms (this process only). */

export type ImportantRole = "supreme_host" | "cohost" | "speaker" | "listener";

export type ImportantMeta = {
  role: ImportantRole;
  isCoHost: boolean;
};

type ImportantMeetingStore = {
  importantRooms: Set<string>;
  allowedSpeakers: Map<string, Set<string>>;
  roomHosts: Map<string, string>;
  coHosts: Map<string, Set<string>>;
};

const globalStore = globalThis as typeof globalThis & {
  __dspacesImportantMeetings?: ImportantMeetingStore;
};

if (!globalStore.__dspacesImportantMeetings) {
  globalStore.__dspacesImportantMeetings = {
    importantRooms: new Set<string>(),
    allowedSpeakers: new Map<string, Set<string>>(),
    roomHosts: new Map<string, string>(),
    coHosts: new Map<string, Set<string>>(),
  };
}

const store = globalStore.__dspacesImportantMeetings;
if (!store.coHosts) store.coHosts = new Map<string, Set<string>>();
if (!store.allowedSpeakers) store.allowedSpeakers = new Map<string, Set<string>>();
if (!store.roomHosts) store.roomHosts = new Map<string, string>();
if (!store.importantRooms) store.importantRooms = new Set<string>();

const importantRooms = store.importantRooms;
const allowedSpeakers = store.allowedSpeakers;
const roomHosts = store.roomHosts;
const coHosts = store.coHosts;

export function parseImportantMeta(raw?: string | null): ImportantMeta {
  try {
    const parsed = JSON.parse(raw || "{}");
    const isCoHost = parsed.isCoHost === true || parsed.role === "cohost";
    let role: ImportantRole = parsed.role;
    if (role !== "supreme_host" && role !== "cohost" && role !== "speaker" && role !== "listener") {
      role = isCoHost ? "cohost" : "listener";
    }
    return { role, isCoHost };
  } catch {
    return { role: "listener", isCoHost: false };
  }
}

export function serializeImportantMeta(meta: ImportantMeta): string {
  return JSON.stringify({
    role: meta.role,
    isCoHost: meta.isCoHost === true,
  });
}

export function markImportantRoom(room: string) {
  importantRooms.add(room);
}

export function isImportantRoom(room: string) {
  return importantRooms.has(room);
}

export function setRoomHost(room: string, identity: string) {
  roomHosts.set(room, identity);
}

export function getRoomHost(room: string) {
  return roomHosts.get(room);
}

export function allowSpeaker(room: string, identity: string) {
  if (!allowedSpeakers.has(room)) {
    allowedSpeakers.set(room, new Set());
  }
  allowedSpeakers.get(room)!.add(identity);
}

export function revokeSpeaker(room: string, identity: string) {
  allowedSpeakers.get(room)?.delete(identity);
}

export function isAllowedSpeaker(room: string, identity: string) {
  return allowedSpeakers.get(room)?.has(identity) === true;
}

export function addCoHost(room: string, identity: string) {
  if (!coHosts.has(room)) {
    coHosts.set(room, new Set());
  }
  coHosts.get(room)!.add(identity);
  allowSpeaker(room, identity);
}

export function removeCoHost(room: string, identity: string) {
  coHosts.get(room)?.delete(identity);
}

export function isCoHost(room: string, identity: string) {
  return coHosts.get(room)?.has(identity) === true;
}
