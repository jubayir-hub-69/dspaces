import { NextResponse } from "next/server";
import { bearerToken, clientIpFromRequest, getRoomService, verifyRoomParticipant } from "../../../lib/dtelecom";
import {
  addCoHost,
  allowSpeaker,
  parseImportantMeta,
  removeCoHost,
  revokeSpeaker,
  serializeImportantMeta,
} from "../../../lib/important-meetings";
import { getRoomState, isRoomCoHost, isRoomHost } from "../../../lib/room-store";
import type { ImportantMeta } from "../../../lib/important-meetings";

export const dynamic = "force-dynamic";

type Action = "allow" | "demote" | "make-cohost";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      room?: string;
      identity?: string;
      serverUrl?: string;
      action?: Action;
      canPublish?: boolean;
    };
    const roomName = body.room;
    const identity = body.identity;
    const token = bearerToken(req);
    const action: Action = body.action || (body.canPublish === false ? "demote" : "allow");

    if (!roomName || !identity || !token) {
      return NextResponse.json(
        { success: false, error: "Missing room, identity, or access token." },
        { status: 400 }
      );
    }

    if (action !== "allow" && action !== "demote" && action !== "make-cohost") {
      return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
    }

    const caller = verifyRoomParticipant(token, roomName);
    const state = await getRoomState(roomName);
    const actorIsSupremeHost = caller.roomAdmin || isRoomHost(state, caller.identity);
    const actorIsCoHost = isRoomCoHost(state, caller.identity);
    const targetIsSupremeHost = isRoomHost(state, identity);
    const targetIsCoHost = isRoomCoHost(state, identity);

    if (targetIsSupremeHost) {
      return NextResponse.json(
        { success: false, error: "The Supreme Host cannot be managed." },
        { status: 403 }
      );
    }

    if (!actorIsSupremeHost && !actorIsCoHost) {
      return NextResponse.json(
        { success: false, error: "Only the host or a co-host can manage the stage." },
        { status: 403 }
      );
    }

    if (action === "make-cohost" && !actorIsSupremeHost) {
      return NextResponse.json(
        { success: false, error: "Only the Supreme Host can appoint a co-host." },
        { status: 403 }
      );
    }

    if (targetIsCoHost && action !== "make-cohost" && !actorIsSupremeHost) {
      return NextResponse.json(
        { success: false, error: "Only the Supreme Host can manage a co-host." },
        { status: 403 }
      );
    }

    let nextPublish = true;
    let nextMeta: ImportantMeta = { role: "speaker", isCoHost: false };

    if (action === "allow") {
      await allowSpeaker(roomName, identity);
      nextPublish = true;
      nextMeta = targetIsCoHost
        ? { role: "cohost", isCoHost: true }
        : { role: "speaker", isCoHost: false };
    } else if (action === "demote") {
      await removeCoHost(roomName, identity);
      await revokeSpeaker(roomName, identity);
      nextPublish = false;
      nextMeta = { role: "listener", isCoHost: false };
    } else if (action === "make-cohost") {
      await addCoHost(roomName, identity);
      nextPublish = true;
      nextMeta = { role: "cohost", isCoHost: true };
    }

    const roomService = await getRoomService(body.serverUrl, clientIpFromRequest(req));

    let metadata = serializeImportantMeta(nextMeta);
    let name = "";
    let existingPerm:
      | {
          canSubscribe?: boolean;
          canPublishData?: boolean;
          canPublishSources?: number[];
          hidden?: boolean;
          recorder?: boolean;
          canUpdateMetadata?: boolean;
        }
      | undefined;
    let avatar = "";

    try {
      const participant = await roomService.getParticipant(roomName, identity);
      const existing = parseImportantMeta(participant.metadata);
      avatar = existing.avatar || "";
      metadata = serializeImportantMeta({
        ...existing,
        ...nextMeta,
        avatar,
      });
      name = participant.name || identity;
      existingPerm = participant.permission;
    } catch {
      // Still attempt the permission update if lookup fails (local-only read).
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
