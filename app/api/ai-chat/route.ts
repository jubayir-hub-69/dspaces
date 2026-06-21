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
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const genData = await generateRes.json();
    if (!generateRes.ok) return NextResponse.json({ success: false, error: "Google AI failed." });

    const answerText = genData.candidates?.[0]?.content?.parts?.[0]?.text;
    return NextResponse.json({ success: true, answer: answerText });
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
