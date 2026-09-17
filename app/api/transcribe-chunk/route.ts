import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Realtime audio transport no longer uses this Vercel route.
 * The server-side LiveKit/dTelecom agent streams PCM over a persistent
 * Gemini Live WebSocket. Vercel KV is only written when an utterance finals.
 */
export async function POST() {
  return NextResponse.json({
    success: true,
    text: "",
    deprecated: true,
    error: "Realtime audio is transcribed by the persistent server agent, not /api/transcribe-chunk.",
  });
}
