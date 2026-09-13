type GeminiModel = {
  name: string;
  supportedGenerationMethods?: string[];
};

export async function selectGeminiModel(apiKey: string): Promise<string> {
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const listRes = await fetch(listUrl);
  const listData = (await listRes.json()) as { models?: GeminiModel[]; error?: { message?: string } };
  if (!listRes.ok) {
    throw new Error(listData.error?.message || "Failed to list Gemini models.");
  }
  const models = listData.models || [];
  const valid = models.filter(
    (m) => m.supportedGenerationMethods?.includes("generateContent") && m.name.includes("gemini")
  );
  return (
    valid.find((m) => /gemini-2\.5-flash/i.test(m.name))?.name ||
    valid.find((m) => /gemini-2\.0-flash/i.test(m.name))?.name ||
    valid.find((m) => /gemini-1\.5-flash/i.test(m.name))?.name ||
    valid.find((m) => /flash/i.test(m.name))?.name ||
    valid.find((m) => /gemini-3\.6-flash/i.test(m.name))?.name ||
    valid[0]?.name ||
    "models/gemini-2.0-flash"
  );
}

export async function geminiGenerateText(apiKey: string, prompt: string): Promise<string> {
  const selectedModel = await selectGeminiModel(apiKey);
  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;
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
  const genData = (await generateRes.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!generateRes.ok) {
    throw new Error(genData.error?.message || "Google API Error");
  }
  const text = genData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Google blocked the response or returned empty data.");
  }
  return text;
}

export function pcm16ToWav(pcm: Buffer, sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

export async function geminiTranscribeAudio(apiKey: string, wav: Buffer, languageHint?: string): Promise<string> {
  const selectedModel = await selectGeminiModel(apiKey);
  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;
  const languageRule = languageHint && languageHint !== "Auto"
    ? `Prefer transcribing in ${languageHint}.`
    : "Automatically detect the spoken language. Use native script (never romanize Bengali or Hindi).";

  const generateRes = await fetch(generateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Transcribe this meeting audio. ${languageRule} Return only the spoken words. If there is no speech, return an empty string.`,
            },
            {
              inlineData: {
                mimeType: "audio/wav",
                data: wav.toString("base64"),
              },
            },
          ],
        },
      ],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    }),
  });
  const genData = (await generateRes.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!generateRes.ok) {
    throw new Error(genData.error?.message || "Gemini transcription failed.");
  }
  return (genData.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}
