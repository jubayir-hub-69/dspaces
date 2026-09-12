import { AccessToken, RoomServiceClient, TokenVerifier } from "@dtelecom/server-sdk-js";
import type { ClaimGrants } from "@dtelecom/server-sdk-js";
import { AGENT_IDENTITY, TRANSCRIPT_TOPIC } from "./types";

export { AGENT_IDENTITY, TRANSCRIPT_TOPIC };

export function getDtelecomCredentials() {
  const apiKey = process.env.DTELECOM_API_KEY || process.env.API_KEY;
  const apiSecret = process.env.DTELECOM_API_SECRET || process.env.API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("Missing DTELECOM_API_KEY / DTELECOM_API_SECRET in environment variables.");
  }
  return { apiKey, apiSecret };
}

export function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!forwarded || forwarded === "127.0.0.1" || forwarded === "::1") {
    return "8.8.8.8";
  }
  return forwarded;
}

export function toApiHost(serverUrl: string): string {
  return serverUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

export async function getRoomService(serverUrl?: string, clientIp?: string): Promise<RoomServiceClient> {
  const { apiKey, apiSecret } = getDtelecomCredentials();
  let apiHost = serverUrl ? toApiHost(serverUrl) : "";
  if (!apiHost) {
    const at = new AccessToken(apiKey, apiSecret, { identity: "server" });
    apiHost = await at.getApiUrl(clientIp);
  }
  if (!apiHost) {
    throw new Error("Could not resolve dTelecom API host.");
  }
  return new RoomServiceClient(apiHost, apiKey, apiSecret);
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return null;
}

export function verifyAccessToken(token: string): ClaimGrants {
  const { apiKey } = getDtelecomCredentials();
  const verifier = new TokenVerifier(apiKey);
  return verifier.verify(token);
}

export type VerifiedParticipant = {
  identity: string;
  room?: string;
  roomAdmin: boolean;
  metadata: string;
  grants: ClaimGrants;
};

export function verifyRoomParticipant(token: string, room: string): VerifiedParticipant {
  const grants = verifyAccessToken(token);
  const identity = grants.sub || "";
  const tokenRoom = grants.video?.room;
  if (!identity) {
    throw new Error("Token is missing participant identity.");
  }
  if (tokenRoom && tokenRoom !== room) {
    throw new Error("Token is not valid for this room.");
  }
  return {
    identity,
    room: tokenRoom,
    roomAdmin: grants.video?.roomAdmin === true,
    metadata: grants.metadata || "",
    grants,
  };
}

export async function createAccessToken(options: {
  identity: string;
  name?: string;
  metadata?: string;
  room: string;
  canPublish: boolean;
  roomAdmin?: boolean;
  hidden?: boolean;
  canPublishData?: boolean;
}) {
  const { apiKey, apiSecret } = getDtelecomCredentials();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: options.identity,
    name: options.name || options.identity,
    metadata: options.metadata,
    webHookURL: process.env.WEBHOOK_URL,
  });
  at.addGrant({
    roomJoin: true,
    room: options.room,
    roomAdmin: options.roomAdmin === true,
    canPublish: options.canPublish,
    canSubscribe: true,
    canPublishData: options.canPublishData !== false,
    hidden: options.hidden === true,
  });
  return at;
}
