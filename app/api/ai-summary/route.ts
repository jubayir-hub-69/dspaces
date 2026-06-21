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

    // Auto-discover the best available model
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();

    if (!listRes.ok) {
       return NextResponse.json({ 
          success: false, 
          error: `API Key Error: ${listData.error?.message || 'Could not verify API Key'}` 
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
            error: "Your Google Account/API Key does not have access to any Gemini text models." 
        });
    }

    const flashModel = validModels.find((m: any) => m.name.includes("1.5-flash"));
    const proModel = validModels.find((m: any) => m.name.includes("1.5-pro"));
    const backupModel = validModels[0];

    const selectedModel = (flashModel || proModel || backupModel).name;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;

    // --- NEW: ADVANCED PROMPT FOR AUTO-CORRECTION AND PROFESSIONAL FORMATTING ---
    const prompt = `You are a highly advanced Executive AI Meeting Assistant. You have been given a raw voice-to-text transcript of a meeting. 
    
    Important Instructions:
    1. The transcript may contain mispronunciations, grammatical errors, broken words, or stuttering. You must completely ignore these errors, understand the true underlying context, and auto-correct the meaning.
    2. Never point out the mistakes. Just provide a flawless, grammatically perfect English output.
    3. Structure your response highly professionally using the exact format below (use markdown):
    
    ✨ **Executive Summary:** 
    (A clear, flawlessly written paragraph summarizing the core discussion)
    
    📌 **Key Highlights:** 
    (Brief bullet points of the most important topics covered)
    
    🎯 **Action Items / To-Do:** 
    (Any decisions made or tasks assigned. If none, simply write "No specific action items were discussed.")
    
    [Raw Meeting Transcript]:
    "${transcript}"`;
    // -----------------------------------------------------------------------------

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
          error: `Generation failed on ${selectedModel}: ${genData.error?.message || 'Unknown error'}` 
      });
    }

    const summaryText = genData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summaryText) {
      return NextResponse.json({ 
          success: false, 
          error: "Google returned an empty summary." 
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
