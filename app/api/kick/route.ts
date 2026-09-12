import { NextResponse } from "next/server";
import { bearerToken, clientIpFromRequest, getRoomService, verifyRoomParticipant } from "../../../lib/dtelecom";
import { getRoomState, isRoomManager } from "../../../lib/room-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      room?: string;
      identity?: string;
      serverUrl?: string;
    };
    const room = (body.room || "").trim();
    const identity = (body.identity || "").trim();
    const token = bearerToken(req);

    if (!room || !identity || !token) {
      return NextResponse.json({ error: "room, identity, and bearer token are required" }, { status: 400 });
    }

    const caller = verifyRoomParticipant(token, room);
    const state = await getRoomState(room);
    const allowed = caller.roomAdmin || isRoomManager(state, caller.identity);
    if (!allowed) {
      return NextResponse.json({ error: "Only the host can remove participants." }, { status: 403 });
    }
    if (state?.hostId && identity === state.hostId) {
      return NextResponse.json({ error: "The host cannot be removed." }, { status: 403 });
    }
    if (identity === caller.identity) {
      return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
    }

    const client = await getRoomService(body.serverUrl, clientIpFromRequest(req));
    await client.removeParticipant(room, identity);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
