export type PrimaryAuth = "email" | "wallet";

export function getDb(): any[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("dspaces_db") || "[]");
  } catch {
    return [];
  }
}

export function saveDb(db: any[]) {
  localStorage.setItem("dspaces_db", JSON.stringify(db));
}

export function normalizeEmail(email: string) {
  return (email || "").trim().toLowerCase();
}

export function isSameAccount(a: any, b: any) {
  if (!a || !b) return false;
  if (a.email && b.email && normalizeEmail(a.email) === normalizeEmail(b.email)) return true;
  if (a.wallet && b.wallet && a.wallet === b.wallet) return true;
  return false;
}

export function isImageAvatar(avatar?: string | null) {
  if (!avatar) return false;
  return avatar.startsWith("data:image") || avatar.startsWith("http://") || avatar.startsWith("https://");
}

export function initialFromAccount(name?: string, email?: string, wallet?: string) {
  const source = (name && name.trim()) || (email ? email.split("@")[0] : "") || wallet || "?";
  return (source.charAt(0) || "?").toUpperCase();
}

export function readPrimaryAuthFlag(): PrimaryAuth | null {
  if (typeof window === "undefined") return null;
  const flag = localStorage.getItem("dspaces_primary_auth");
  if (flag === "wallet" || flag === "email") return flag;
  return null;
}

export function writePrimaryAuthFlag(value: PrimaryAuth) {
  if (typeof window === "undefined") return;
  localStorage.setItem("dspaces_primary_auth", value);
}

export function accountPrimaryAuth(acc: any): PrimaryAuth | null {
  if (acc?.primary_auth === "wallet" || acc?.primary_auth === "email") return acc.primary_auth;
  if (acc?.primaryAuth === "wallet" || acc?.primaryAuth === "email") return acc.primaryAuth;
  return null;
}

export function withPrimaryAuth(acc: any, value: PrimaryAuth) {
  return { ...acc, primary_auth: value, primaryAuth: value };
}

export function resolvePrimaryAuth(acc: any): PrimaryAuth {
  const stored = accountPrimaryAuth(acc) || readPrimaryAuthFlag();
  if (stored) return stored;
  const sessionId = typeof window !== "undefined" ? localStorage.getItem("dspaces_active_session") : null;
  if (sessionId && acc?.wallet && sessionId === acc.wallet) return "wallet";
  if (sessionId && acc?.email && sessionId === acc.email) return "email";
  if (acc?.wallet && !acc?.email) return "wallet";
  return "email";
}

export function formatPrimaryIdentity(acc: any) {
  if (!acc) return "";
  const primary = resolvePrimaryAuth(acc);
  if (primary === "wallet" && acc.wallet) {
    return `${acc.wallet.substring(0, 4)}...${acc.wallet.substring(acc.wallet.length - 4)}`;
  }
  if (primary === "email" && acc.email) return acc.email;
  if (acc.wallet) return `${acc.wallet.substring(0, 4)}...${acc.wallet.substring(acc.wallet.length - 4)}`;
  return acc.email || "";
}

export function emailTakenByOther(email: string, current?: any) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getDb().some(
    (a: any) => a.email && normalizeEmail(a.email) === normalized && !isSameAccount(a, current)
  );
}

export function walletTakenByOther(wallet: string, current?: any) {
  if (!wallet) return false;
  return getDb().some((a: any) => a.wallet && a.wallet === wallet && !isSameAccount(a, current));
}

export async function checkEmailAvailable(email: string, current?: any): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "Please enter a valid email address." };
  if (emailTakenByOther(normalized, current)) {
    return { ok: false, error: "This email is already connected to another account." };
  }
  try {
    const res = await fetch("/api/global-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CHECK",
        type: "email",
        value: normalized,
        currentEmail: current?.email || null,
      }),
    });
    const data = await res.json();
    if (data.isUsed) {
      return { ok: false, error: data.error || "This email is already connected to another account." };
    }
    if (!data.success && data.error === "DB not connected") {
      return { ok: true };
    }
  } catch {
    // Fall back to the local DB check above if the global store is unreachable.
  }
  return { ok: true };
}

export async function checkWalletAvailable(wallet: string, current?: any): Promise<{ ok: boolean; error?: string }> {
  if (!wallet) return { ok: false, error: "Missing wallet address." };
  if (walletTakenByOther(wallet, current)) {
    return { ok: false, error: "This wallet is already used in another account." };
  }
  try {
    const res = await fetch("/api/global-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CHECK",
        type: "wallet",
        value: wallet,
        currentWallet: current?.wallet || null,
      }),
    });
    const data = await res.json();
    if (data.isUsed) {
      return { ok: false, error: data.error || "This wallet is already used in another account." };
    }
    if (!data.success && data.error === "DB not connected") {
      return { ok: true };
    }
  } catch {
    // Fall back to the local DB check above if the global store is unreachable.
  }
  return { ok: true };
}

export async function linkIdentityOnServer(
  type: "email" | "wallet",
  value: string,
  current?: any
): Promise<{ ok: boolean; error?: string; account?: any }> {
  const payload = {
    action: "LINK",
    type,
    value,
    currentEmail: current?.email || null,
    currentWallet: current?.wallet || null,
    primary_auth: accountPrimaryAuth(current),
    name: current?.name,
  };
  try {
    const res = await fetch("/api/global-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJsonSafe(res);
    if (!data.success) {
      return {
        ok: false,
        error: data.error || (type === "email"
          ? "This email is already connected to another account."
          : "This wallet is already used in another account."),
      };
    }
    return { ok: true, account: data.account };
  } catch {
    return { ok: false, error: "Could not verify identity with the server." };
  }
}

export function mergeServerAccount(serverAcc: any, fallback?: any) {
  if (!serverAcc && !fallback) return null;
  const merged = {
    ...(fallback || {}),
    ...(serverAcc || {}),
    email: serverAcc?.email ?? fallback?.email ?? null,
    wallet: serverAcc?.wallet ?? fallback?.wallet ?? null,
    name: serverAcc?.name || fallback?.name || (serverAcc?.email ? String(serverAcc.email).split("@")[0] : ""),
    avatar: serverAcc?.avatar || fallback?.avatar || "",
  };
  const primary =
    serverAcc?.primary_auth ||
    fallback?.primary_auth ||
    fallback?.primaryAuth ||
    resolvePrimaryAuth(merged);
  const next = withPrimaryAuth(merged, primary);

  const db = getDb();
  const idx = db.findIndex(
    (a: any) =>
      (next.email && a.email && normalizeEmail(a.email) === normalizeEmail(next.email)) ||
      (next.wallet && a.wallet && a.wallet === next.wallet)
  );
  if (idx >= 0) {
    db[idx] = { ...db[idx], ...next };
  } else {
    db.unshift(next);
  }
  saveDb(db);
  writePrimaryAuthFlag(primary);
  return next;
}

export async function fetchServerAccount(opts: { email?: string | null; wallet?: string | null }) {
  const type = opts.email ? "email" : "wallet";
  const value = opts.email || opts.wallet;
  if (!value) return null;
  try {
    const res = await fetch("/api/global-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "GET_ACCOUNT",
        type,
        value,
        currentEmail: opts.email || null,
        currentWallet: opts.wallet || null,
      }),
    });
    const data = await res.json();
    return data.account || null;
  } catch {
    return null;
  }
}

export async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function initialsAvatarHtml(name: string, size = 120) {
  const letter = initialFromAccount(name);
  const font = Math.round(size * 0.42);
  return `<div class="custom-avatar" style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#06b6d4);display:flex;align-items:center;justify-content:center;font-size:${font}px;font-weight:800;color:#fff;border:3px solid #00e5ff;box-shadow:0 0 25px rgba(0,229,255,0.4);">${letter}</div>`;
}
