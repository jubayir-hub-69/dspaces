import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { claimIdentity, findAccountRecord, takenError, upsertAccountRecord } from '../../../lib/identity-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const otp = body.otp;
    const purpose = body.purpose === "link" ? "link" : "login";
    const cookieStore = await cookies();
    const hash = cookieStore.get('otp_hash')?.value;
    const email = cookieStore.get('otp_email')?.value;

    if (!hash || !email) {
      return NextResponse.json({ error: 'OTP expired or invalid' }, { status: 400 });
    }

    const secret = process.env.NEXTAUTH_SECRET || 'fallback_secret';
    const validHash = crypto.createHmac('sha256', secret).update(`${email}.${otp}`).digest('hex');

    if (hash === validHash) {
      if (purpose === "link") {
        const claimed = await claimIdentity("email", email, body.currentEmail || null);
        if (!claimed.ok) {
          return NextResponse.json(
            { error: claimed.error || takenError("email") },
            { status: 400 }
          );
        }
        const account = await upsertAccountRecord({
          email,
          wallet: body.currentWallet || null,
        });
        const res = NextResponse.json({ success: true, email, account });
        res.cookies.delete('otp_hash');
        res.cookies.delete('otp_email');
        return res;
      }

      const account =
        (await findAccountRecord({ email })) ||
        (await upsertAccountRecord({ email, primary_auth: "email", name: email.split("@")[0] }));
      const res = NextResponse.json({ success: true, email, account });
      res.cookies.delete('otp_hash');
      res.cookies.delete('otp_email');
      return res;
    }

    return NextResponse.json({ error: 'Incorrect OTP' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}