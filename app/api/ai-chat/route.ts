import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transcript, question, language = "English" } = body;

    if (!transcript) return NextResponse.json({ success: false, error: "No transcript." });
    if (!question) return NextResponse.json({ success: false, error: "Please enter a question." });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ success: false, error: "GEMINI_API_KEY is missing." });

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    
    const models = listData.models || [];
    const validModels = models.filter((m: any) => m.supportedGenerationMethods?.includes("generateContent") && m.name.includes("gemini"));
    const selectedModel = (validModels.find((m: any) => m.name.includes("1.5-flash")) || validModels.find((m: any) => m.name.includes("1.5-pro")) || validModels[0])?.name;

    if (!selectedModel) return NextResponse.json({ success: false, error: "No compatible models found." });

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;

    const prompt = `You are an expert AI Meeting Assistant. Based ONLY on the following live meeting transcript, answer the user's question professionally.
    
    CRITICAL RULE: You MUST write your final answer completely in: **${language}**.
    
    [Meeting Transcript]
    ${transcript}
    
    [User Question]
    ${question}`;

    const generateRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
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

    const answerText = genData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!answerText) {
         return NextResponse.json({ success: false, error: "Google blocked the response or returned empty data." });
    }

    return NextResponse.json({ success: true, answer: answerText });
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Server Crash: ${error.message}` });
  }
}
