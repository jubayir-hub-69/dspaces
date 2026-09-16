import { NextResponse } from "next/server";
import { bearerToken, getRoomService, sanitizeMediaUrl, verifyRoomParticipant } from "../../../lib/dtelecom";
import { geminiTranscribeAudio, pcm16ToWav, pcmRms } from "../../../lib/gemini";
import { appendTranscript } from "../../../lib/room-store";
import { TRANSCRIPT_TOPIC } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_PCM_BYTES = 3200;
const SILENCE_RMS = 0.0015;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      room?: string;
      speaker?: string;
      language?: string;
      serverUrl?: string;
      sampleRate?: number;
      pcmBase64?: string;
    };
    const room = (body.room || "").trim();
    const token = bearerToken(req);
    if (!room || !token) {
      return NextResponse.json({ error: "room and bearer token are required" }, { status: 400 });
    }
    const caller = verifyRoomParticipant(token, room);
    const pcmBase64 = body.pcmBase64 || "";
    if (!pcmBase64) {
      return NextResponse.json({ success: true, text: "" });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is missing." }, { status: 500 });
    }

    const pcm = Buffer.from(pcmBase64, "base64");
    if (pcm.length < MIN_PCM_BYTES) {
      return NextResponse.json({ success: true, text: "" });
    }

    const energy = pcmRms(pcm);
    if (energy < SILENCE_RMS) {
      return NextResponse.json({ success: true, text: "" });
    }

    const sampleRate = body.sampleRate === 48000 || body.sampleRate === 16000 ? body.sampleRate : 16000;
    const speaker = (body.speaker || caller.identity || "Participant").trim();
    console.log("[STT] transcribe-chunk received", {
      room,
      speaker,
      bytes: pcm.length,
      sampleRate,
      energy: Number(energy.toFixed(4)),
      language: body.language,
    });

    const text = (await geminiTranscribeAudio(apiKey, pcm16ToWav(pcm, sampleRate), body.language)).trim();
    if (!text) {
      return NextResponse.json({ success: true, text: "" });
    }

    const segment = {
      speaker,
      text,
      at: Date.now(),
      isFinal: true as const,
    };
    const state = await appendTranscript(room, segment);
    const payload = new TextEncoder().encode(JSON.stringify({ type: "transcript", ...segment }));
    try {
      const svc = await getRoomService(sanitizeMediaUrl(body.serverUrl));
      await svc.sendData(room, payload, 0, { topic: TRANSCRIPT_TOPIC });
    } catch (error) {
      console.warn("[STT] data-channel broadcast failed; transcript still persisted", error);
    }

    console.log("[STT] transcribe-chunk ok", { room, speaker, text: text.slice(0, 120) });
    return NextResponse.json({
      success: true,
      text,
      transcript: state?.transcript || text,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    console.error("[STT] transcribe-chunk error", message);
    return NextResponse.json({ success: true, text: "", error: message });
  }
}
