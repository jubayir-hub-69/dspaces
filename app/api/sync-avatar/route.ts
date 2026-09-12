import { NextResponse } from "next/server";
import { clientIpFromRequest, getRoomService } from "../../../lib/dtelecom";
import { getGlobalAvatars, getRoomState, saveRoomState, upsertGlobalAvatar } from "../../../lib/room-store";
import { parseParticipantMeta, serializeParticipantMeta } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      avatar?: string;
      room?: string;
      serverUrl?: string;
    };
    const name = (body.name || "").trim();
    const avatar = typeof body.avatar === "string" ? body.avatar : "";

    const avatars = name && avatar
      ? await upsertGlobalAvatar(name, avatar)
      : await getGlobalAvatars();

    if (body.room && name && avatar) {
      const state = await getRoomState(body.room);
      if (state) {
        state.avatars = { ...state.avatars, [name]: avatar };
        await saveRoomState(body.room, state);
      }
      try {
        const roomService = await getRoomService(body.serverUrl, clientIpFromRequest(req));
        const participant = await roomService.getParticipant(body.room, name);
        const meta = parseParticipantMeta(participant.metadata);
        await roomService.updateParticipant(
          body.room,
          name,
          serializeParticipantMeta({ ...meta, avatar }),
          participant.permission,
          participant.name || name
        );
      } catch {
        // Participant metadata update is best-effort; KV is the durable store.
      }
    }

    return NextResponse.json({ success: true, avatars });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const avatars = await getGlobalAvatars();
    return NextResponse.json({ success: true, avatars });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
