import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifySignIn } from "@solana/wallet-standard-util";
import { isKvConfigured, kvDel, kvGet, kvSet } from "../../../lib/kv";
import {
  buildClientSignInInput,
  deserializeSignInOutput,
  SIWS_CHAIN_ID,
  type SerializedSignInOutput,
} from "../../../lib/siws";
import type { SolanaSignInInput } from "@solana/wallet-standard-features";

export const dynamic = "force-dynamic";

function nonceKey(nonce: string) {
  return `dspaces_siws_${nonce}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") || req.headers.get("host") || "dspaces.app";
  const uri = url.searchParams.get("uri") || `${url.protocol === "http:" ? "http" : "https"}://${domain}`;
  const nonce = randomBytes(16).toString("base64url");
  const input = buildClientSignInInput(nonce, domain, uri);

  if (isKvConfigured()) {
    await kvSet(nonceKey(nonce), { nonce, domain, createdAt: Date.now() }, 300);
  }

  return NextResponse.json({ success: true, input, network: SIWS_CHAIN_ID });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      input?: SolanaSignInInput;
      output?: SerializedSignInOutput;
    };
    const input = body.input;
    const rawOutput = body.output;
    if (!input?.nonce || !rawOutput?.account?.address) {
      return NextResponse.json({ success: false, error: "Missing SIWS payload." }, { status: 400 });
    }

    if (isKvConfigured()) {
      const stored = await kvGet<{ nonce: string }>(nonceKey(input.nonce));
      if (!stored) {
        return NextResponse.json({ success: false, error: "SIWS nonce is invalid or expired." }, { status: 401 });
      }
      await kvDel(nonceKey(input.nonce));
    }

    const output = deserializeSignInOutput(rawOutput);
    if (!verifySignIn(input, output)) {
      return NextResponse.json({ success: false, error: "Sign-In With Solana verification failed." }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      address: output.account.address,
      network: SIWS_CHAIN_ID,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "SIWS verification failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
