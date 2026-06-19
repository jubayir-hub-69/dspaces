import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const transcript = body.transcript;

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json({ 
          success: false, 
          error: "No conversation detected. Please speak clearly into the microphone." 
      });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    
    if (!apiKey) {
      return NextResponse.json({ 
          success: false, 
          error: "GEMINI_API_KEY is missing in your Vercel Environment Variables." 
      });
    }

    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(googleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Please provide a professional and concise summary of this meeting transcript:\n\n${transcript}` }] }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ 
          success: false, 
          error: `${data.error?.message || response.statusText}` 
      });
    }

    const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summaryText) {
      return NextResponse.json({ 
          success: false, 
          error: "Google returned an empty response. Please try again." 
      });
    }

    return NextResponse.json({ success: true, summary: summaryText });
    
  } catch (error: any) {
    return NextResponse.json({ 
        success: false, 
        error: `Server Crash: ${error.message || "Unknown error occurred"}` 
    });
  }
}
