import { NextResponse } from "next/server";
import { bearerToken, verifyRoomParticipant } from "../../../lib/dtelecom";
import { getRoomState, updateRoomState } from "../../../lib/room-store";
import { runTranscriptionAgent } from "../../../lib/transcription-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") || "";
  if (!room) {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }
  const state = await getRoomState(room);
  return NextResponse.json({
    success: true,
    transcript: state?.transcript || "",
    segments: state?.transcriptSegments || [],
    agentActive: state?.agentActive === true,
  });
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { room?: string };
    const room = (body.room || "").trim();
    const token = bearerToken(req);
    if (!room || !token) {
      return NextResponse.json({ error: "room and bearer token are required" }, { status: 400 });
    }
    verifyRoomParticipant(token, room);
    await updateRoomState(room, (current) => ({ ...current, agentActive: false }));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const body = (await req.json()) as { room?: string; language?: string; serverUrl?: string };
  const room = (body.room || "").trim();
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

  const existing = await getRoomState(room);
  if (existing?.agentActive) {
    return NextResponse.json({ success: true, alreadyActive: true, transcript: existing.transcript || "" });
  }

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        send("status", { state: "starting" });
        const handle = await runTranscriptionAgent({
          roomName: room,
          language: body.language,
          signal: abort.signal,
          serverUrl: body.serverUrl,
        });
        send("status", { state: "connected" });

        const poll = setInterval(async () => {
          if (abort.signal.aborted) return;
          const state = await getRoomState(room);
          if (state && state.agentActive === false) {
            abort.abort();
            return;
          }
          send("transcript", {
            transcript: state?.transcript || "",
            segments: state?.transcriptSegments || [],
          });
        }, 2000);

        await new Promise<void>((resolve) => {
          abort.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        clearInterval(poll);
        await handle.stop();
        send("status", { state: "stopped" });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to start transcription agent";
        send("error", { error: message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
