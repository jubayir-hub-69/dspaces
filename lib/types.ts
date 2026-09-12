export const AGENT_IDENTITY = "ai_agent";
export const TRANSCRIPT_TOPIC = "dspaces-transcript";

export type RoomMode = "standard" | "important";

export type MeetingRole = "host" | "guest" | "supreme_host" | "cohost" | "speaker" | "listener";

export type ParticipantMeta = {
  role: MeetingRole;
  isCoHost: boolean;
  avatar?: string;
};

export type TranscriptSegment = {
  speaker: string;
  text: string;
  at: number;
  isFinal: boolean;
};

export type RoomState = {
  hostId: string;
  mode: RoomMode;
  coHosts: string[];
  speakers: string[];
  avatars: Record<string, string>;
  transcript: string;
  transcriptSegments: TranscriptSegment[];
  agentActive: boolean;
  createdAt: number;
};

export function parseParticipantMeta(raw?: string | null): ParticipantMeta {
  try {
    const parsed = JSON.parse(raw || "{}") as Partial<ParticipantMeta> & { isCoHost?: boolean; role?: string };
    const isCoHost = parsed.isCoHost === true || parsed.role === "cohost";
    const role = parsed.role;
    const valid: MeetingRole[] = ["host", "guest", "supreme_host", "cohost", "speaker", "listener"];
    const safeRole: MeetingRole = valid.includes(role as MeetingRole)
      ? (role as MeetingRole)
      : isCoHost
        ? "cohost"
        : "listener";
    return {
      role: safeRole,
      isCoHost,
      avatar: typeof parsed.avatar === "string" ? parsed.avatar : undefined,
    };
  } catch {
    return { role: "guest", isCoHost: false };
  }
}

export function serializeParticipantMeta(meta: ParticipantMeta): string {
  return JSON.stringify({
    role: meta.role,
    isCoHost: meta.isCoHost === true,
    avatar: meta.avatar || "",
  });
}

export function isHostRole(role?: string | null): boolean {
  return role === "host" || role === "supreme_host";
}

export function isManagerRole(role?: string | null): boolean {
  return isHostRole(role) || role === "cohost";
}
