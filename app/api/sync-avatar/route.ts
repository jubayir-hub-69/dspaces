import { NextResponse } from 'next/server';

// Temporary cloud memory for active meetings
let globalAvatars: Record<string, string> = {};

export async function POST(req: Request) {
  try {
    const { name, avatar } = await req.json();
    if (name && avatar) {
      globalAvatars[name] = avatar;
    }
    return NextResponse.json({ success: true, avatars: globalAvatars });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

export async function GET() {
  return NextResponse.json({ success: true, avatars: globalAvatars });
}
