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
          error: "No conversation detected. Please speak into the microphone first." 
      });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    
    if (!apiKey) {
      return NextResponse.json({ 
          success: false, 
          error: "Gemini API Key is missing in Vercel." 
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Please provide a clear, professional, and concise summary of the following meeting transcript:\n\n${transcript}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summaryText = response.text();

    return NextResponse.json({ success: true, summary: summaryText });
    
  } catch (error: any) {
    return NextResponse.json({ 
        success: false, 
        error: `Gemini Fetch Error: ${error.message || "Unknown error occurred"}` 
    });
  }
}
