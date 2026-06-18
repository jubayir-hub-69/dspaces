import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { action, type, value } = await req.json(); 
        
        const url = process.env.KV_REST_API_URL;
        const token = process.env.KV_REST_API_TOKEN;

        if (!url || !token) {
            return NextResponse.json({ success: false, error: "DB not connected" });
        }

        const key = type === 'email' ? 'dspaces_used_emails' : 'dspaces_used_wallets';
        
        // Fetch real-time data from Vercel Database
        const getRes = await fetch(`${url}/get/${key}`, { 
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store'
        });
        const getData = await getRes.json();
        let list = getData.result ? JSON.parse(getData.result) : [];

        // Check if Email/Wallet exists
        if (action === 'CHECK') {
            return NextResponse.json({ success: true, isUsed: list.includes(value) });
        }

        // Add new Email/Wallet to Database
        if (action === 'ADD') {
            if (!list.includes(value)) {
                list.push(value);
                await fetch(`${url}/set/${key}/${JSON.stringify(list)}`, { 
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` } 
                });
            }
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false });
    } catch (err) {
        return NextResponse.json({ success: false, error: "Server error" });
    }
}
