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
                error: "Missing API Key or Secret in Vercel." 
            }, { status: 400 });
        }

        // 1. Create Token
        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
        });

        // 2. Add required grants (dTelecom strictly needs canPublish and canSubscribe)
        at.addGrant({ 
            roomJoin: true, 
            room: roomName,
            canPublish: true,
            canSubscribe: true 
        });
        
        const token = at.toJwt();

        // 3. Get IP and fetch WebSocket URL
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
        const wsUrl = await at.getWsUrl(clientIp);

        // If dTelecom server rejects or fails to return a URL
        if (!wsUrl) {
             return NextResponse.json({ 
                 error: "dTelecom server did not return a valid WebSocket URL. Please check your dTelecom dashboard limits." 
             }, { status: 500 });
        }

        return NextResponse.json({ token, url: wsUrl });
        
    } catch (error: any) {
        // This will print the exact server error on your screen
        return NextResponse.json({ 
            error: `dTelecom API Error: ${error.message || "Unknown server error occurred"}` 
        }, { status: 500 });
    }
}
