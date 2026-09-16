type GeminiModel = {
  name: string;
  supportedGenerationMethods?: string[];
};

type GeminiPart = {
  text?: string;
  thought?: boolean;
};

type GeminiGenerateResponse = {
  error?: { message?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: GeminiPart[] };
  }>;
};

const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

const BLOCKED_MODEL = /(?:tts|image|computer-use|robotics|customtools|embed|gemma)/i;

const TEXT_MODEL_PREF = [
  /gemini-3\.8-flash/i,
  /gemini-3\.7-flash/i,
  /gemini-3\.6-flash/i,
  /gemini-3\.5-flash(?!-(?:lite|image))/i,
  /gemini-flash-latest/i,
  /gemini-3\.5-flash-lite/i,
  /gemini-3\.5-flash/i,
];

const TRANSCRIBE_MODEL_PREF = [
  /gemini-3\.8-flash/i,
  /gemini-3\.7-flash/i,
  /gemini-3\.6-flash/i,
  /gemini-3\.5-flash(?!-(?:lite|image))/i,
  /gemini-flash-latest/i,
  /gemini-3\.5-flash/i,
  /gemini-3\.5-transcribe/i,
];

const HARDCODED_TEXT_MODELS = [
  "models/gemini-3.8-flash",
  "models/gemini-3.7-flash",
  "models/gemini-3.6-flash",
  "models/gemini-3.5-flash",
  "models/gemini-flash-latest",
];

const HARDCODED_TRANSCRIBE_MODELS = [
  ...HARDCODED_TEXT_MODELS,
  "models/gemini-3.5-transcribe",
];

let listedModels: { at: number; names: string[] } | null = null;
const MODEL_CACHE_MS = 10 * 60 * 1000;
const skippedModels = new Set<string>();

function isUsableModel(name: string): boolean {
  return name.includes("gemini") && !BLOCKED_MODEL.test(name);
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function rankModels(names: string[], prefs: RegExp[], fallbacks: string[]): string[] {
  const usable = names.filter(isUsableModel);
  const ranked: string[] = [];
  for (const pref of prefs) {
    for (const name of usable) {
      if (pref.test(name)) ranked.push(name);
    }
  }
  ranked.push(...usable.filter((name) => /flash/i.test(name)));
  ranked.push(...usable);
  ranked.push(...fallbacks);
  return uniqueNames(ranked).filter((name) => !skippedModels.has(name));
}

async function listGeminiModelNames(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (listedModels && now - listedModels.at < MODEL_CACHE_MS) {
    return listedModels.names;
  }
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const listRes = await fetch(listUrl);
  const listData = (await listRes.json()) as { models?: GeminiModel[]; error?: { message?: string } };
  if (!listRes.ok) {
    throw new Error(listData.error?.message || "Failed to list Gemini models.");
  }
  const names = (listData.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && isUsableModel(m.name))
    .map((m) => m.name);
  listedModels = { at: now, names };
  return names;
}

export async function selectGeminiModel(apiKey: string): Promise<string> {
  const names = await listGeminiModelNames(apiKey);
  const ranked = rankModels(names, TEXT_MODEL_PREF, HARDCODED_TEXT_MODELS);
  return ranked[0] || "models/gemini-3.6-flash";
}

async function selectTranscribeModels(apiKey: string): Promise<string[]> {
  try {
    const names = await listGeminiModelNames(apiKey);
    const ranked = rankModels(names, TRANSCRIBE_MODEL_PREF, HARDCODED_TRANSCRIBE_MODELS);
    return ranked.length ? ranked : HARDCODED_TRANSCRIBE_MODELS;
  } catch (error) {
    console.warn("[STT] model list failed, using hardcoded Gemini models", error);
    return HARDCODED_TRANSCRIBE_MODELS.filter((name) => !skippedModels.has(name));
  }
}

function extractGeminiText(data: GeminiGenerateResponse): string {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => part && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function shouldSkipModel(status: number, message: string): boolean {
  if (status === 404) return true;
  return /no longer available|not found|not supported by this model|unsupported mime/i.test(message);
}

async function geminiGenerateContent(
  apiKey: string,
  models: string[],
  body: Record<string, unknown>
): Promise<GeminiGenerateResponse> {
  let lastError = "No compatible Gemini model is available.";
  const tried = models.slice(0, 8);
  for (const model of tried) {
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
    const generateRes = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        safetySettings: SAFETY_SETTINGS,
      }),
    });
    const genData = (await generateRes.json()) as GeminiGenerateResponse;
    const message = genData.error?.message || "";
    if (!generateRes.ok) {
      lastError = message || `Google API Error (${generateRes.status})`;
      console.warn("[STT] Gemini generate failed", { model, status: generateRes.status, message: lastError });
      if (shouldSkipModel(generateRes.status, lastError)) {
        skippedModels.add(model);
        continue;
      }
      throw new Error(lastError);
    }
    console.log("[STT] Gemini model ok", model);
    return genData;
  }
  throw new Error(lastError);
}

export async function geminiGenerateText(apiKey: string, prompt: string): Promise<string> {
  const names = await listGeminiModelNames(apiKey);
  const models = rankModels(names, TEXT_MODEL_PREF, HARDCODED_TEXT_MODELS);
  const genData = await geminiGenerateContent(apiKey, models, {
    contents: [{ parts: [{ text: prompt }] }],
  });
  const text = extractGeminiText(genData);
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

export function pcmRms(pcm: Buffer): number {
  if (pcm.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 1 < pcm.length; i += 16) {
    const s = pcm.readInt16LE(i) / 32768;
    sum += s * s;
    count += 1;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

export function normalizeSttText(text: string): string {
  const trimmed = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (
    /^(no speech|no audible speech|silence|\(no speech\)|\(silence\)|\[silence\]|\[no speech\]|\.\.\.|…|n\/a|none|empty|blank)$/i.test(
      lower
    )
  ) {
    return "";
  }
  return trimmed;
}

export async function geminiTranscribeAudio(apiKey: string, wav: Buffer, languageHint?: string): Promise<string> {
  if (!wav.length || wav.length < 44 + 3200) return "";
  try {
    const models = await selectTranscribeModels(apiKey);
    const languageRule =
      languageHint && languageHint !== "Auto"
        ? `Prefer transcribing in ${languageHint}.`
        : "Automatically detect the spoken language. Use native script (never romanize Bengali or Hindi).";

    const genData = await geminiGenerateContent(apiKey, models, {
      contents: [
        {
          parts: [
            {
              text: `Transcribe this meeting audio. ${languageRule} Return only the spoken words. If there is no speech, return an empty string. Do not describe the audio or say that it is silent.`,
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
    });
    const text = normalizeSttText(extractGeminiText(genData));
    if (!text) {
      console.log("[STT] Gemini returned no speech", {
        finishReason: genData.candidates?.[0]?.finishReason || "none",
      });
    }
    return text;
  } catch (error) {
    console.warn("[STT] Gemini transcription failed (non-fatal)", error);
    return "";
  }
}
