import { AccessToken } from '@dtelecom/server-sdk-js';
import { NextResponse } from 'next/server';
import {
    getRoomHost,
    isImportantRoom,
    markImportantRoom,
    removeCoHost,
    revokeSpeaker,
    serializeImportantMeta,
    setRoomHost,
    type ImportantRole,
} from '../../../lib/important-meetings';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const roomName = body.room || "dSpaces-Room";
        const participantName = body.username || "Guest";

        const apiKey = process.env.DTELECOM_API_KEY;
        const apiSecret = process.env.DTELECOM_API_SECRET;

        if (!apiKey || !apiSecret) {
            return NextResponse.json({ 
                error: "Missing DTELECOM API keys in environment variables." 
            }, { status: 500 });
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
        });

        const isImportantMode = body.mode === "important" || isImportantRoom(roomName);
        const isHost = body.isHost === true || body.isHost === "true";
        let importantRole: ImportantRole = "listener";

        if (isImportantMode && isHost) {
            markImportantRoom(roomName);
            setRoomHost(roomName, participantName);
        }

        if (isImportantMode) {
            const hostId = getRoomHost(roomName);
            let canPublish = false;
            const isSupremeHost = isHost || (!!hostId && hostId === participantName);

            if (isSupremeHost) {
                importantRole = "supreme_host";
                canPublish = true;
                markImportantRoom(roomName);
                setRoomHost(roomName, participantName);
            } else {
                importantRole = "listener";
                canPublish = false;
                revokeSpeaker(roomName, participantName);
                removeCoHost(roomName, participantName);
            }

            at.metadata = serializeImportantMeta({
                role: importantRole,
                isCoHost: false,
            });

            at.addGrant({
                roomJoin: true,
                room: roomName,
                canPublish,
                canSubscribe: true,
                canPublishData: true,
            });
        } else {
            at.addGrant({ 
                roomJoin: true, 
                room: roomName,
                canPublish: true,
                canSubscribe: true 
            });
        }
        
        const token = at.toJwt();

        let clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
        
        if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') {
            clientIp = '8.8.8.8'; 
        }

        const wsUrl = await at.getWsUrl(clientIp);

        if (!wsUrl) {
             return NextResponse.json({ 
                 error: "dTelecom server could not assign a video node right now. Please try again later." 
             }, { status: 500 });
        }

        if (isImportantMode) {
            return NextResponse.json({ token, url: wsUrl, important: true, role: importantRole });
        }

        return NextResponse.json({ token, url: wsUrl });
        
    } catch (error: any) {
        return NextResponse.json({ 
            error: `dTelecom API Error: ${error.message || "Unknown error"}` 
        }, { status: 500 });
    }
}
