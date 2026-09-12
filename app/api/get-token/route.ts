import { NextResponse } from "next/server";
import { createAccessToken, clientIpFromRequest } from "../../../lib/dtelecom";
import { getGlobalAvatars, getRoomState, roleForParticipant } from "../../../lib/room-store";
import { serializeParticipantMeta, type MeetingRole } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      room?: string;
      username?: string;
      avatar?: string;
    };
    const roomName = (body.room || "dSpaces-Room").trim();
    const participantName = (body.username || "Guest").trim();

    const roomState = await getRoomState(roomName);
    const important = roomState?.mode === "important";
    const role: MeetingRole = roleForParticipant(roomState, participantName, important);
    const isAdmin = role === "host" || role === "supreme_host";
    const isCoHost = role === "cohost";

    const avatars = await getGlobalAvatars();
    const avatar = (typeof body.avatar === "string" && body.avatar) || avatars[participantName] || roomState?.avatars?.[participantName] || "";

    let canPublish = true;
    if (important) {
      canPublish = isAdmin || isCoHost || role === "speaker";
    }

    const at = await createAccessToken({
      identity: participantName,
      name: participantName,
      metadata: serializeParticipantMeta({
        role,
        isCoHost,
        avatar,
      }),
      room: roomName,
      canPublish,
      roomAdmin: isAdmin,
      canPublishData: true,
    });

    const token = at.toJwt();
    const wsUrl = await at.getWsUrl(clientIpFromRequest(req));
    if (!wsUrl) {
      return NextResponse.json(
        { error: "dTelecom server could not assign a video node right now. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      token,
      url: wsUrl,
      important,
      role,
      isAdmin,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `dTelecom API Error: ${message}` }, { status: 500 });
  }
}
