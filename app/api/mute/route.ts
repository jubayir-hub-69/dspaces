import { NextResponse } from "next/server";
import { bearerToken, clientIpFromRequest, getRoomService, verifyRoomParticipant } from "../../../lib/dtelecom";
import { getRoomState, isRoomManager } from "../../../lib/room-store";

const TRACK_TYPE_AUDIO = 0;
const TRACK_TYPE_VIDEO = 1;
const TRACK_SOURCE_MICROPHONE = 2;
const TRACK_SOURCE_SCREEN_SHARE_AUDIO = 4;

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      room?: string;
      identity?: string;
      trackSid?: string;
      serverUrl?: string;
      type?: "audio" | "video";
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
      return NextResponse.json({ error: "Only the host can mute participants." }, { status: 403 });
    }
    if (state?.hostId && identity === state.hostId && identity !== caller.identity) {
      return NextResponse.json({ error: "The host cannot be muted by others." }, { status: 403 });
    }

    const client = await getRoomService(body.serverUrl, clientIpFromRequest(req));
    const trackSids: string[] = [];
    if (body.trackSid) {
      trackSids.push(body.trackSid);
    } else {
      const participant = await client.getParticipant(room, identity);
      for (const track of participant.tracks || []) {
        const isAudio =
          track.type === TRACK_TYPE_AUDIO ||
          track.source === TRACK_SOURCE_MICROPHONE ||
          track.source === TRACK_SOURCE_SCREEN_SHARE_AUDIO;
        const isVideo = track.type === TRACK_TYPE_VIDEO;
        if (body.type === "video" ? isVideo : isAudio) {
          trackSids.push(track.sid);
        }
      }
    }

    if (trackSids.length === 0) {
      return NextResponse.json({ error: "No published track found to mute." }, { status: 404 });
    }

    for (const trackSid of trackSids) {
      await client.mutePublishedTrack(room, identity, trackSid, true);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
