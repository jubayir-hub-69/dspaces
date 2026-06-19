import { AccessToken } from '@dtelecom/server-sdk-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const roomName = body.room || "dSpaces-Room";
        const participantName = body.username || "Guest";

        const apiKey = process.env.DTELECOM_API_KEY;
        const apiSecret = process.env.DTELECOM_API_SECRET;

        if (!apiKey || !apiSecret) {
            return NextResponse.json({ 
                error: "Missing API Key or Secret in Vercel. Please check Environment Variables." 
            }, { status: 500 });
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
        });

        at.addGrant({ roomJoin: true, room: roomName });
        
        const token = at.toJwt();

        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
        const wsUrl = await at.getWsUrl(clientIp);

        return NextResponse.json({ token, url: wsUrl });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to generate token" }, { status: 500 });
    }
}
