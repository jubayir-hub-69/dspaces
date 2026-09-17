"use client";

/**
 * Client-side PCM capture and POST /api/transcribe-chunk has been removed.
 * Realtime audio now stays on the server-side LiveKit/dTelecom agent:
 * persistent Gemini Live WebSocket, per-speaker VAD, Vercel KV for finals only.
 */
export function RoomAudioTranscriber(): null {
  return null;
}
