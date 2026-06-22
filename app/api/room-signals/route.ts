import { NextResponse } from 'next/server';

// Temporary cloud memory for host commands
let roomSignals: any[] = [];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Add new host command to cloud
    roomSignals.push({
      target: body.target,
      action: body.action,
      timestamp: Date.now()
    });
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

export async function GET() {
  // Clean up old commands (older than 10 seconds) to keep server fast
  roomSignals = roomSignals.filter(s => Date.now() - s.timestamp < 10000);
  return NextResponse.json({ success: true, signals: roomSignals });
}
