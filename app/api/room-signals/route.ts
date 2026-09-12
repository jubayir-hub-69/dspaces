import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Client-side room signals are disabled. Use /api/mute and /api/kick with a host token.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json({ success: true, signals: [] });
}
