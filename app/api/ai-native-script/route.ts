import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = (body.text || "").trim();
    if (!text) return NextResponse.json({ success: true, text: "" });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ success: false, error: "GEMINI_API_KEY is missing." });

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();
    const models = listData.models || [];
    const validModels = models.filter(
      (m: any) => m.supportedGenerationMethods?.includes("generateContent") && m.name.includes("gemini")
    );
    const selectedModel =
      validModels.find((m: any) => /gemini-3\.6-flash/i.test(m.name))?.name ||
      validModels.find((m: any) => /3\.6-flash/i.test(m.name))?.name ||
      "models/gemini-3.6-flash";

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;
    const prompt = `You are a speech-to-text script restorer.

The input is a live transcript. It may be in the wrong writing system (for example Bengali spoken aloud but written in Latin letters such as "shiksha" instead of "শিক্ষা").

STRICT RULES:
1. Detect the language that was actually spoken.
2. Transcribe the speech EXACTLY in the native script of that language.
3. If Bengali was spoken, write in বাংলা লিপি (Bengali script). Never output romanized Bengali.
4. If Hindi was spoken, write in देवनागरी.
5. If English was spoken, keep English in Latin letters.
6. Mixed speech: keep each phrase in its own native script.
7. Do NOT translate. Do NOT paraphrase. Do NOT add headings, quotes, or commentary.
8. Output ONLY the corrected transcript.

[Transcript]
${text}`;

    const generateRes = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });

    const genData = await generateRes.json();
    const restored = genData.candidates?.[0]?.content?.parts?.[0]?.text;
    return NextResponse.json({ success: true, text: (restored || text).trim() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
