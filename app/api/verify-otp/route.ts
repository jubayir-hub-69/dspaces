import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { otp } = await req.json();
    const cookieStore = await cookies();
    const hash = cookieStore.get('otp_hash')?.value;
    const email = cookieStore.get('otp_email')?.value;

    if (!hash || !email) {
      return NextResponse.json({ error: 'OTP expired or invalid' }, { status: 400 });
    }

    const secret = process.env.NEXTAUTH_SECRET || 'fallback_secret';
    const validHash = crypto.createHmac('sha256', secret).update(`${email}.${otp}`).digest('hex');

    if (hash === validHash) {
      const res = NextResponse.json({ success: true, email: email });
      res.cookies.delete('otp_hash');
      res.cookies.delete('otp_email');
      return res;
    }

    return NextResponse.json({ error: 'Incorrect OTP' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}