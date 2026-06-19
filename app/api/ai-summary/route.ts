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

    // Step 1: Auto-discover available models for this specific API Key
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
    
    // Find models that support text generation
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

    // Auto-select the best available model (Flash > Pro > Anything else)
    const flashModel = validModels.find((m: any) => m.name.includes("1.5-flash"));
    const proModel = validModels.find((m: any) => m.name.includes("1.5-pro"));
    const backupModel = validModels[0];

    const selectedModel = (flashModel || proModel || backupModel).name;

    // Step 2: Generate the summary using the auto-discovered model
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;

    const generateRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Please provide a professional and concise summary of this meeting transcript:\n\n${transcript}` }] }]
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
