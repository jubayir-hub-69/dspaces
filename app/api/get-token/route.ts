import { AccessToken } from '@dtelecom/server-sdk-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room');
  const username = req.nextUrl.searchParams.get('username');

  if (!room || !username) {
    return NextResponse.json({ error: 'Missing room or username' }, { status: 400 });
  }

  // 🔴 Strict Backend Security: Only allow correctly formatted rooms
  const isValidRoom = /^dSpaces-\d{4}$/.test(room);
  if (!isValidRoom) {
    return NextResponse.json({ error: 'Invalid Room ID Format. Access Denied.' }, { status: 403 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;

  try {
    const uniqueId = `user_${Math.floor(Math.random() * 1000000)}`;

    const at = new AccessToken(apiKey, apiSecret, { 
      identity: uniqueId, 
      name: username 
    });
    
    at.addGrant({ roomJoin: true, room: room, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    
    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    
    const wsUrl = await at.getWsUrl(clientIp);

    return NextResponse.json({ token, wsUrl });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
