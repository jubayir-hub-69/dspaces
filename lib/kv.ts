function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function isKvConfigured() {
  return !!kvConfig();
}

function parseKvValue(result: unknown): unknown {
  if (result == null) return null;
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const kv = kvConfig();
  if (!kv) return null;
  const res = await fetch(`${kv.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kv.token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: unknown };
  const parsed = parseKvValue(data.result);
  return (parsed as T) ?? null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const kv = kvConfig();
  if (!kv) throw new Error("DB not connected");
  const encoded = encodeURIComponent(JSON.stringify(value));
  const res = await fetch(`${kv.url}/set/${encodeURIComponent(key)}/${encoded}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to persist ${key}`);
  }
}

export async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  const value = await kvGet<T>(key);
  return value == null ? fallback : value;
}
