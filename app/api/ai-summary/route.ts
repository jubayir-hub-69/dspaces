import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transcript, language = "Auto" } = body;

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json({ success: false, error: "No conversation detected." });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ success: false, error: "GEMINI_API_KEY is missing." });

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();

    if (!listRes.ok) return NextResponse.json({ success: false, error: `API Key Error: ${listData.error?.message}` });

    const models = listData.models || [];
    const validModels = models.filter((m: any) => m.supportedGenerationMethods?.includes("generateContent") && m.name.includes("gemini"));
    const selectedModel =
      validModels.find((m: any) => /gemini-3\.6-flash/i.test(m.name))?.name ||
      validModels.find((m: any) => /3\.6-flash/i.test(m.name))?.name ||
      "models/gemini-3.6-flash";

    if (!selectedModel) return NextResponse.json({ success: false, error: "No compatible models found." });

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;

    const summaryMode = language === "Both" ? "Both" : language === "Bengali" ? "Bengali" : language === "Auto" || language === "auto-detect" ? "Auto" : language || "English";
    const outputLanguageRule =
      summaryMode === "Both"
        ? `Write the COMPLETE summary twice, with the same structure both times:
    First, an English section titled "## English".
    Then, a Bengali section titled "## বাংলা" written entirely in Bengali native script (বাংলা লিপি), not romanized.`
        : summaryMode === "Bengali"
          ? "Write the ENTIRE response (including headings) in Bengali native script (বাংলা লিপি). Never romanize."
          : summaryMode === "Auto"
            ? "Automatically detect the language(s) in the transcript. Write the ENTIRE response in the native script of that language. If Bengali was spoken, use বাংলা লিপি (e.g. শিক্ষা), never Latin transliteration."
            : `Write the ENTIRE response (including headings) perfectly in: **${summaryMode}**. If the output language is Bengali, use native Bengali script, never romanization.`;

    const prompt = `You are a highly advanced Executive AI Meeting Assistant. 
    
    Important Instructions:
    1. Automatically detect the spoken language(s) in the raw transcript. The transcript may be in native script OR romanized (e.g. "shiksha" meaning শিক্ষা). Understand the original language; do not assume it is English.
    2. Ignore errors, stuttering, or mispronunciations in the raw transcript. Understand the core context.
    3. CRITICAL RULE: ${outputLanguageRule}
    4. Never transliterate Bengali/Hindi into English letters in the summary output unless the chosen summary language is English.
    5. Structure your response professionally using markdown:
    
    ✨ **Executive Summary:** (A clear paragraph summarizing the core discussion)
    
    📌 **Key Highlights:** (Brief bullet points)
    
    🎯 **Action Items / To-Do:** (Decisions made or tasks assigned)
    
    [Raw Meeting Transcript]:
    "${transcript}"`;

    const generateRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
        // NEW: Forcing Google to NEVER block any summary due to false-positive safety flags
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const genData = await generateRes.json();
    
    if (!generateRes.ok) {
        return NextResponse.json({ success: false, error: `Google API Error: ${genData.error?.message || 'Unknown Server Issue'}` });
    }

    const summaryText = genData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!summaryText) {
        return NextResponse.json({ success: false, error: "Google blocked the response or returned empty data." });
    }

    return NextResponse.json({ success: true, summary: summaryText });
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Server Crash: ${error.message}` });
  }
}
