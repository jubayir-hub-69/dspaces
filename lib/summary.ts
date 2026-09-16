export type BilingualSummaryParts = {
  english: string;
  bengali: string;
};

const HEADER_RE =
  /(?:^|\n)(?:#{1,3}\s*|\*\*|__)?\s*(English|Bengali|Bangla|বাংলা)\s*(?:\*\*|__)?\s*:?[ \t]*(?:\n+|$)/gi;

function normalizeLang(label: string): "english" | "bengali" {
  return label.toLowerCase() === "english" ? "english" : "bengali";
}

export function splitBilingualSummary(raw: string): BilingualSummaryParts | null {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const hits: Array<{ lang: "english" | "bengali"; index: number; end: number }> = [];
  const re = new RegExp(HEADER_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    hits.push({
      lang: normalizeLang(match[1]),
      index: match.index + (match[0].startsWith("\n") ? 1 : 0),
      end: match.index + match[0].length,
    });
  }

  const englishHit = hits.find((hit) => hit.lang === "english");
  const bengaliHit = hits.find((hit) => hit.lang === "bengali");
  if (!englishHit || !bengaliHit) return null;

  const ordered = [...hits].sort((a, b) => a.index - b.index);
  const bodyOf = (hit: (typeof hits)[0]) => {
    const next = ordered.find((item) => item.index > hit.index);
    return text.slice(hit.end, next ? next.index : text.length).trim();
  };

  const english = bodyOf(englishHit);
  const bengali = bodyOf(bengaliHit);
  if (!english || !bengali) return null;
  return { english, bengali };
}
