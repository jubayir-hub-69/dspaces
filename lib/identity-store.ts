const EMAIL_ERROR = "This email is already connected to another account.";
const WALLET_ERROR = "This wallet is already used in another account.";

export type IdentityType = "email" | "wallet";

export function normalizeIdentity(type: IdentityType, value: string) {
  const trimmed = (value || "").trim();
  return type === "email" ? trimmed.toLowerCase() : trimmed;
}

export function takenError(type: IdentityType) {
  return type === "email" ? EMAIL_ERROR : WALLET_ERROR;
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function listKey(type: IdentityType) {
  return type === "email" ? "dspaces_used_emails" : "dspaces_used_wallets";
}

function parseKvList(result: unknown): string[] {
  if (!result) return [];
  if (Array.isArray(result)) return result.map((item) => String(item));
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function readList(type: IdentityType): Promise<string[]> {
  const kv = kvConfig();
  if (!kv) return [];
  const getRes = await fetch(`${kv.url}/get/${listKey(type)}`, {
    headers: { Authorization: `Bearer ${kv.token}` },
    cache: "no-store",
  });
  const getData = await getRes.json();
  return parseKvList(getData.result);
}

async function writeList(type: IdentityType, list: string[]) {
  const kv = kvConfig();
  if (!kv) throw new Error("DB not connected");
  await fetch(`${kv.url}/set/${listKey(type)}/${JSON.stringify(list)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}` },
  });
}

export function isKvConfigured() {
  return !!kvConfig();
}

export async function isIdentityUsed(type: IdentityType, value: string, except?: string | null) {
  const normalized = normalizeIdentity(type, value);
  if (!normalized) return false;
  const skip = except ? normalizeIdentity(type, except) : "";
  if (skip && normalized === skip) return false;
  const list = await readList(type);
  return list.some((item) => normalizeIdentity(type, item) === normalized);
}

export async function claimIdentity(
  type: IdentityType,
  value: string,
  except?: string | null
): Promise<{ ok: boolean; error?: string; dbConnected: boolean }> {
  const normalized = normalizeIdentity(type, value);
  if (!normalized) {
    return { ok: false, error: type === "email" ? "Email is required" : "Wallet is required", dbConnected: isKvConfigured() };
  }
  if (!isKvConfigured()) {
    return { ok: false, error: "DB not connected", dbConnected: false };
  }
  const list = await readList(type);
  const skip = except ? normalizeIdentity(type, except) : "";
  const taken = list.some((item) => {
    const itemNorm = normalizeIdentity(type, item);
    return itemNorm === normalized && itemNorm !== skip;
  });
  if (taken) {
    return { ok: false, error: takenError(type), dbConnected: true };
  }
  if (!list.some((item) => normalizeIdentity(type, item) === normalized)) {
    list.push(normalized);
    await writeList(type, list);
  }
  return { ok: true, dbConnected: true };
}

export type AccountRecord = {
  email: string | null;
  wallet: string | null;
  primary_auth: "email" | "wallet";
  name?: string;
  avatar?: string;
};

const ACCOUNTS_KEY = "dspaces_accounts";

function parseAccounts(result: unknown): AccountRecord[] {
  if (!result) return [];
  let parsed: unknown = result;
  if (typeof result === "string") {
    try {
      parsed = JSON.parse(result);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => item && typeof item === "object") as AccountRecord[];
}

async function readAccounts(): Promise<AccountRecord[]> {
  const kv = kvConfig();
  if (!kv) return [];
  const getRes = await fetch(`${kv.url}/get/${ACCOUNTS_KEY}`, {
    headers: { Authorization: `Bearer ${kv.token}` },
    cache: "no-store",
  });
  const getData = await getRes.json();
  return parseAccounts(getData.result);
}

async function writeAccounts(accounts: AccountRecord[]) {
  const kv = kvConfig();
  if (!kv) throw new Error("DB not connected");
  await fetch(`${kv.url}/set/${ACCOUNTS_KEY}/${JSON.stringify(accounts)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}` },
  });
}

function matchesAccount(account: AccountRecord, email?: string | null, wallet?: string | null) {
  const emailNorm = email ? normalizeIdentity("email", email) : "";
  const walletNorm = wallet ? normalizeIdentity("wallet", wallet) : "";
  if (emailNorm && account.email && normalizeIdentity("email", account.email) === emailNorm) return true;
  if (walletNorm && account.wallet && account.wallet === walletNorm) return true;
  return false;
}

export async function findAccountRecord(opts: { email?: string | null; wallet?: string | null }) {
  if (!isKvConfigured()) return null;
  const accounts = await readAccounts();
  return accounts.find((account) => matchesAccount(account, opts.email, opts.wallet)) || null;
}

export async function upsertAccountRecord(patch: {
  email?: string | null;
  wallet?: string | null;
  primary_auth?: "email" | "wallet";
  name?: string;
  avatar?: string;
}): Promise<AccountRecord | null> {
  if (!isKvConfigured()) return null;
  const email = patch.email ? normalizeIdentity("email", patch.email) : "";
  const wallet = patch.wallet ? normalizeIdentity("wallet", patch.wallet) : "";
  const accounts = await readAccounts();
  const idx = accounts.findIndex((account) => matchesAccount(account, email || null, wallet || null));

  if (idx >= 0) {
    const current = accounts[idx];
    const next: AccountRecord = {
      ...current,
      email: email || current.email,
      wallet: wallet || current.wallet,
      primary_auth: current.primary_auth || patch.primary_auth || (current.wallet ? "wallet" : "email"),
      name: patch.name ?? current.name,
      avatar: patch.avatar ?? current.avatar,
    };
    accounts[idx] = next;
    await writeAccounts(accounts);
    return next;
  }

  const created: AccountRecord = {
    email: email || null,
    wallet: wallet || null,
    primary_auth: patch.primary_auth || (email && !wallet ? "email" : "wallet"),
    name: patch.name,
    avatar: patch.avatar || "",
  };
  accounts.push(created);
  await writeAccounts(accounts);
  return created;
}
