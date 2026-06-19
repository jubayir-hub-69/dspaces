import { GoogleGenerativeAI } from '@google/generative-ai';
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

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // CRITICAL FIX: Using the latest supported model for the updated package
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Please provide a professional and concise summary of this meeting transcript:\n\n${transcript}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ success: true, summary: text });
    
  } catch (error: any) {
    return NextResponse.json({ 
        success: false, 
        error: `Google API Error: ${error.message || "Unknown error occurred"}` 
    });
  }
}
