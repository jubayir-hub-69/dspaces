import type { SolanaSignInInput, SolanaSignInOutput } from "@solana/wallet-standard-features";

export const SIWS_CHAIN_ID = "mainnet";
export const SIWS_STATEMENT =
  "Sign in to dSpaces. This proves you own this Solana wallet. It will not create a transaction or cost any SOL.";

export type SerializedSignInOutput = {
  account: {
    address: string;
    publicKey: number[];
    chains?: string[];
    features?: string[];
  };
  signedMessage: number[];
  signature: number[];
  signatureType?: "ed25519";
};

export function toByteArray(value: unknown): number[] {
  if (!value) return [];
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map((item) => Number(item));
  if (typeof value === "object" && value && "data" in (value as { data?: unknown })) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return data.map((item) => Number(item));
    if (data instanceof Uint8Array) return Array.from(data);
  }
  if (typeof value === "string") {
    try {
      if (typeof atob === "function") {
        return Array.from(atob(value), (char) => char.charCodeAt(0));
      }
      return Array.from(Buffer.from(value, "base64"));
    } catch {
      return [];
    }
  }
  return [];
}

export function deserializeSignInOutput(raw: SerializedSignInOutput): SolanaSignInOutput {
  const publicKey = new Uint8Array(toByteArray(raw.account?.publicKey));
  return {
    account: {
      address: raw.account.address,
      publicKey,
      chains: (raw.account.chains as SolanaSignInOutput["account"]["chains"]) || [`solana:${SIWS_CHAIN_ID}`],
      features: (raw.account.features as SolanaSignInOutput["account"]["features"]) || [],
    },
    signedMessage: new Uint8Array(toByteArray(raw.signedMessage)),
    signature: new Uint8Array(toByteArray(raw.signature)),
    signatureType: raw.signatureType || "ed25519",
  };
}

export function serializeSignInOutput(output: SolanaSignInOutput): SerializedSignInOutput {
  return {
    account: {
      address: output.account.address,
      publicKey: toByteArray(output.account.publicKey),
      chains: output.account.chains ? [...output.account.chains] : [`solana:${SIWS_CHAIN_ID}`],
      features: output.account.features ? [...output.account.features] : [],
    },
    signedMessage: toByteArray(output.signedMessage),
    signature: toByteArray(output.signature),
    signatureType: output.signatureType || "ed25519",
  };
}

export function buildClientSignInInput(nonce: string, domain?: string, uri?: string): SolanaSignInInput {
  const host = domain || (typeof window !== "undefined" ? window.location.host : "dspaces.app");
  const href = uri || (typeof window !== "undefined" ? window.location.origin : `https://${host}`);
  return {
    domain: host,
    statement: SIWS_STATEMENT,
    uri: href,
    version: "1",
    chainId: SIWS_CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
  };
}
