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

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
        });

        at.addGrant({ 
            roomJoin: true, 
            room: roomName,
            canPublish: true,
            canSubscribe: true 
        });
        
        const token = at.toJwt();

        const fallbackVerifiedIp = '203.0.113.1'; 

        const wsUrl = await at.getWsUrl(fallbackVerifiedIp);

        if (!wsUrl) {
             return NextResponse.json({ 
                 error: "dTelecom routing failed. The server could not assign a video node for the given IP." 
             }, { status: 500 });
        }

        return NextResponse.json({ token, url: wsUrl });
        
    } catch (error: any) {
        return NextResponse.json({ 
            error: `dTelecom API Error: ${error.message || "Unknown error occurred"}` 
        }, { status: 500 });
    }
}
