import { NextResponse } from "next/server";
import {
  claimIdentity,
  findAccountRecord,
  isIdentityUsed,
  isKvConfigured,
  normalizeIdentity,
  takenError,
  upsertAccountRecord,
  type IdentityType,
} from "../../../lib/identity-store";

function asType(type: string): IdentityType | null {
  if (type === "email" || type === "wallet") return type;
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action as string;
    const type = asType(body.type);
    const value = typeof body.value === "string" ? body.value : "";
    const except =
      type === "email"
        ? body.except || body.currentEmail || null
        : body.except || body.currentWallet || null;

    if (!type) {
      return NextResponse.json({ success: false, error: "Invalid identity type" }, { status: 400 });
    }

    if (!isKvConfigured()) {
      return NextResponse.json({ success: false, error: "DB not connected" }, { status: 503 });
    }

    const normalized = normalizeIdentity(type, value);
    if (!normalized) {
      return NextResponse.json({ success: false, error: "Missing identity value" }, { status: 400 });
    }

    if (action === "CHECK") {
      const isUsed = await isIdentityUsed(type, normalized, except);
      return NextResponse.json({ success: true, isUsed });
    }

    if (action === "GET_ACCOUNT") {
      const account = await findAccountRecord({
        email: type === "email" ? normalized : body.currentEmail || null,
        wallet: type === "wallet" ? normalized : body.currentWallet || null,
      });
      return NextResponse.json({ success: true, account: account || null });
    }

    if (action === "LINK") {
      const result = await claimIdentity(type, normalized, except);
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error || takenError(type), isUsed: true },
          { status: 400 }
        );
      }
      const account = await upsertAccountRecord({
        email: type === "email" ? normalized : body.currentEmail || null,
        wallet: type === "wallet" ? normalized : body.currentWallet || null,
        primary_auth: body.primary_auth,
        name: body.name,
      });
      return NextResponse.json({ success: true, account });
    }

    if (action === "ADD") {
      const result = await claimIdentity(type, normalized, except);
      if (!result.ok && result.error !== takenError(type)) {
        return NextResponse.json({ success: false, error: result.error }, { status: 500 });
      }
      const existing = await findAccountRecord({
        email: type === "email" ? normalized : null,
        wallet: type === "wallet" ? normalized : null,
      });
      const account =
        existing ||
        (await upsertAccountRecord({
          email: type === "email" ? normalized : null,
          wallet: type === "wallet" ? normalized : null,
          primary_auth: type === "email" ? "email" : "wallet",
        }));
      return NextResponse.json({ success: true, alreadyUsed: !result.ok, account });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
