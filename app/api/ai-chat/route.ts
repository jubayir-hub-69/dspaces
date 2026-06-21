import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transcript, question } = body;

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json({ 
          success: false, 
          error: "No conversation history found to analyze." 
      });
    }

    if (!question || question.trim() === '') {
      return NextResponse.json({ 
          success: false, 
          error: "Please enter a question." 
      });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ 
          success: false, 
          error: "GEMINI_API_KEY is missing in Vercel." 
      });
    }

    // Auto-discover the best available model for stability
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();

    if (!listRes.ok) {
       return NextResponse.json({ 
          success: false, 
          error: "Could not verify API Key with Google." 
       });
    }

    const models = listData.models || [];
    const validModels = models.filter((m: any) => 
        m.supportedGenerationMethods?.includes("generateContent") && 
        m.name.includes("gemini")
    );

    if (validModels.length === 0) {
        return NextResponse.json({ 
            success: false, 
            error: "No compatible text models found." 
        });
    }

    const flashModel = validModels.find((m: any) => m.name.includes("1.5-flash"));
    const proModel = validModels.find((m: any) => m.name.includes("1.5-pro"));
    const selectedModel = (flashModel || proModel || validModels[0]).name;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;

    const prompt = `You are an expert AI Meeting Assistant. Based ONLY on the following live meeting transcript, answer the user's question professionally and accurately.\n\n[Meeting Transcript]\n${transcript}\n\n[User Question]\n${question}`;

    const generateRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const genData = await generateRes.json();

    if (!generateRes.ok) {
      return NextResponse.json({ 
          success: false, 
          error: genData.error?.message || "Google AI failed to respond." 
      });
    }

    const answerText = genData.candidates?.[0]?.content?.parts?.[0]?.text;

    return NextResponse.json({ success: true, answer: answerText });
    
  } catch (error: any) {
    return NextResponse.json({ 
        success: false, 
        error: error.message || "Internal Server Error" 
    });
  }
}
