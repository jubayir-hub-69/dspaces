import { NextResponse } from "next/server";
import { getRoomService, clientIpFromRequest } from "../../../lib/dtelecom";
import { isKvConfigured } from "../../../lib/kv";
import { createRoomState, getRoomState } from "../../../lib/room-store";
import type { RoomMode } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      room?: string;
      identity?: string;
      mode?: string;
    };
    const roomName = (body.room || "").trim();
    const identity = (body.identity || "").trim();
    const mode: RoomMode = body.mode === "important" ? "important" : "standard";

    if (!roomName || !identity) {
      return NextResponse.json({ error: "room and identity are required" }, { status: 400 });
    }

    if (!isKvConfigured()) {
      return NextResponse.json(
        { error: "Room host state requires KV_REST_API_URL and KV_REST_API_TOKEN." },
        { status: 500 }
      );
    }

    const existing = await getRoomState(roomName);
    if (existing?.hostId && existing.hostId !== identity) {
      return NextResponse.json(
        { error: "This room already has a host. Join it as a participant instead." },
        { status: 409 }
      );
    }

    const state = existing?.hostId
      ? existing
      : await createRoomState(roomName, identity, mode);

    try {
      const roomService = await getRoomService(undefined, clientIpFromRequest(req));
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 60 * 60,
        maxParticipants: 100,
        metadata: JSON.stringify({
          createdBy: state.hostId,
          mode: state.mode,
        }),
      });
    } catch {
      // Room may already exist on the SFU; host state is still persisted in KV.
    }

    return NextResponse.json({
      success: true,
      room: roomName,
      hostId: state.hostId,
      mode: state.mode,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
