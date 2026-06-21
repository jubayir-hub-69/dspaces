import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // NEW: Catching the requested language
    const { transcript, language = "English" } = body;

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json({ success: false, error: "No conversation detected." });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ success: false, error: "GEMINI_API_KEY is missing." });

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();

    if (!listRes.ok) return NextResponse.json({ success: false, error: "API Key Error." });

    const models = listData.models || [];
    const validModels = models.filter((m: any) => m.supportedGenerationMethods?.includes("generateContent") && m.name.includes("gemini"));
    const selectedModel = (validModels.find((m: any) => m.name.includes("1.5-flash")) || validModels.find((m: any) => m.name.includes("1.5-pro")) || validModels[0])?.name;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;

    // NEW: Prompt updated to translate everything into the selected language
    const prompt = `You are a highly advanced Executive AI Meeting Assistant. 
    
    Important Instructions:
    1. Ignore errors, stuttering, or mispronunciations in the raw transcript. Understand the core context.
    2. CRITICAL RULE: You MUST write the ENTIRE response (including headings) perfectly in: **${language}**.
    3. Structure your response professionally using markdown:
    
    ✨ **Executive Summary:** (A clear paragraph summarizing the core discussion in ${language})
    
    📌 **Key Highlights:** (Brief bullet points in ${language})
    
    🎯 **Action Items / To-Do:** (Decisions made or tasks assigned in ${language})
    
    [Raw Meeting Transcript]:
    "${transcript}"`;

    const generateRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const genData = await generateRes.json();
    if (!generateRes.ok) return NextResponse.json({ success: false, error: "Google API Failed." });

    const summaryText = genData.candidates?.[0]?.content?.parts?.[0]?.text;
    return NextResponse.json({ success: true, summary: summaryText });
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
