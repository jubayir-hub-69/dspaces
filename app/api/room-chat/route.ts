import { NextResponse } from "next/server";
import { bearerToken, verifyRoomParticipant } from "../../../lib/dtelecom";
import { appendChatMessage, getRoomChat } from "../../../lib/room-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const room = (url.searchParams.get("room") || "").trim();
  const token = bearerToken(req);
  if (!room || !token) {
    return NextResponse.json({ error: "room and bearer token are required" }, { status: 400 });
  }
  try {
    verifyRoomParticipant(token, room);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid token";
    return NextResponse.json({ error: message }, { status: 401 });
  }
  const messages = await getRoomChat(room);
  return NextResponse.json({ success: true, messages });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      room?: string;
      identity?: string;
      name?: string;
      message?: string;
      timestamp?: number;
      id?: string;
    };
    const room = (body.room || "").trim();
    const token = bearerToken(req);
    if (!room || !token) {
      return NextResponse.json({ error: "room and bearer token are required" }, { status: 400 });
    }
    const participant = verifyRoomParticipant(token, room);
    const message = (body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    const identity = (body.identity || participant.identity || "").trim();
    const messages = await appendChatMessage(room, {
      id: body.id,
      identity,
      name: (body.name || identity).trim(),
      message,
      timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
    });
    return NextResponse.json({ success: true, messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
