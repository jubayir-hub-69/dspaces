import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const roomName = body.room || "dSpaces-Room";
        const participantName = body.username || "Guest";

        const apiKey = process.env.LIVEKIT_API_KEY || process.env.DTELECOM_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET || process.env.DTELECOM_API_SECRET;
        const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.NEXT_PUBLIC_DTELECOM_URL;

        if (!apiKey || !apiSecret || !wsUrl) {
            return NextResponse.json({ 
                error: "Missing API Key or WebSocket URL in Vercel Environment Variables. Please check your Vercel settings." 
            }, { status: 500 });
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
        });

        at.addGrant({ roomJoin: true, room: roomName });
        const token = await at.toJwt();

        return NextResponse.json({ token, url: wsUrl });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to generate connection token" }, { status: 500 });
    }
}
