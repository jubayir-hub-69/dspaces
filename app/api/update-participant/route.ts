import { AccessToken, RoomServiceClient } from "@dtelecom/server-sdk-js";
import { NextResponse } from "next/server";
import {
  addCoHost,
  allowSpeaker,
  getRoomHost,
  isCoHost,
  markImportantRoom,
  parseImportantMeta,
  removeCoHost,
  revokeSpeaker,
  serializeImportantMeta,
  type ImportantMeta,
} from "../../../lib/important-meetings";

function toApiHost(serverUrl: string) {
  return serverUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

type Action = "allow" | "demote" | "make-cohost";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const roomName = body.room as string | undefined;
    const identity = body.identity as string | undefined;
    const serverUrl = body.serverUrl as string | undefined;
    const actorIdentity = (body.actorIdentity as string | undefined) || "";
    const action = (body.action as Action | undefined) || (body.canPublish === false ? "demote" : "allow");

    if (!roomName || !identity) {
      return NextResponse.json(
        { success: false, error: "Missing room or identity." },
        { status: 400 }
      );
    }

    if (action !== "allow" && action !== "demote" && action !== "make-cohost") {
      return NextResponse.json(
        { success: false, error: "Unknown action." },
        { status: 400 }
      );
    }

    const apiKey = process.env.DTELECOM_API_KEY;
    const apiSecret = process.env.DTELECOM_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, error: "Missing DTELECOM API keys in environment variables." },
        { status: 500 }
      );
    }

    markImportantRoom(roomName);

    const hostId = getRoomHost(roomName);
    const actorIsSupremeHost = !!actorIdentity && !!hostId && actorIdentity === hostId;
    const actorIsCoHost = !!actorIdentity && isCoHost(roomName, actorIdentity);
    const targetIsSupremeHost = !!hostId && identity === hostId;
    const targetIsCoHost = isCoHost(roomName, identity);

    if (targetIsSupremeHost) {
      return NextResponse.json(
        { success: false, error: "The Supreme Host cannot be managed." },
        { status: 403 }
      );
    }

    if (actorIdentity && !actorIsSupremeHost && !actorIsCoHost) {
      return NextResponse.json(
        { success: false, error: "Only the host or a co-host can manage the stage." },
        { status: 403 }
      );
    }

    if (action === "make-cohost" && actorIdentity && !actorIsSupremeHost) {
      return NextResponse.json(
        { success: false, error: "Only the Supreme Host can appoint a co-host." },
        { status: 403 }
      );
    }

    if (targetIsCoHost && action !== "make-cohost" && actorIdentity && !actorIsSupremeHost) {
      return NextResponse.json(
        { success: false, error: "Only the Supreme Host can manage a co-host." },
        { status: 403 }
      );
    }

    let nextPublish = true;
    let nextMeta: ImportantMeta = { role: "speaker", isCoHost: false };

    if (action === "allow") {
      allowSpeaker(roomName, identity);
      nextPublish = true;
      nextMeta = targetIsCoHost
        ? { role: "cohost", isCoHost: true }
        : { role: "speaker", isCoHost: false };
    } else if (action === "demote") {
      removeCoHost(roomName, identity);
      revokeSpeaker(roomName, identity);
      nextPublish = false;
      nextMeta = { role: "listener", isCoHost: false };
    } else if (action === "make-cohost") {
      addCoHost(roomName, identity);
      nextPublish = true;
      nextMeta = { role: "cohost", isCoHost: true };
    }

    let apiHost: string | undefined;
    if (serverUrl) {
      apiHost = toApiHost(serverUrl);
    } else {
      const at = new AccessToken(apiKey, apiSecret, { identity: "server" });
      let clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (!clientIp || clientIp === "127.0.0.1" || clientIp === "::1") {
        clientIp = "8.8.8.8";
      }
      apiHost = await at.getApiUrl(clientIp);
    }

    if (!apiHost) {
      return NextResponse.json(
        { success: false, error: "Could not resolve dTelecom API host." },
        { status: 500 }
      );
    }

    const roomService = new RoomServiceClient(apiHost, apiKey, apiSecret);

    let metadata = serializeImportantMeta(nextMeta);
    let name = "";
    let existingPerm: {
      canSubscribe?: boolean;
      canPublishData?: boolean;
      canPublishSources?: number[];
      hidden?: boolean;
      recorder?: boolean;
      canUpdateMetadata?: boolean;
    } | undefined;

    try {
      const participant = await roomService.getParticipant(roomName, identity);
      const existing = parseImportantMeta(participant.metadata);
      metadata = serializeImportantMeta({
        ...existing,
        ...nextMeta,
      });
      name = participant.name || identity;
      existingPerm = participant.permission;
    } catch {
      // Still attempt the permission update if lookup fails.
    }

    await roomService.updateParticipant(
      roomName,
      identity,
      metadata,
      {
        canSubscribe: existingPerm?.canSubscribe ?? true,
        canPublish: nextPublish,
        canPublishData: existingPerm?.canPublishData ?? true,
        canPublishSources: existingPerm?.canPublishSources ?? [],
        hidden: existingPerm?.hidden ?? false,
        recorder: existingPerm?.recorder ?? false,
        canUpdateMetadata: existingPerm?.canUpdateMetadata ?? false,
      },
      name
    );

    return NextResponse.json({ success: true, role: nextMeta.role, canPublish: nextPublish });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
