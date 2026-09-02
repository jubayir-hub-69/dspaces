import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { isIdentityUsed, isKvConfigured, normalizeIdentity, takenError } from '../../../lib/identity-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = normalizeIdentity("email", body.email || "");
    const purpose = body.purpose === "link" ? "link" : "login";
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    if (purpose === "link" && isKvConfigured()) {
      try {
        const taken = await isIdentityUsed("email", email, body.currentEmail || null);
        if (taken) {
          return NextResponse.json(
            { error: takenError("email") },
            { status: 400 }
          );
        }
      } catch {
        // Occupancy lookup failed; continue and let send-mail errors surface separately.
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const secret = process.env.NEXTAUTH_SECRET || 'fallback_secret';
    const hash = crypto.createHmac('sha256', secret).update(`${email}.${otp}`).digest('hex');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"dSpaces Hub" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your dSpaces Login Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; background-color: #030712; color: #ffffff; border-radius: 10px;">
          <h2 style="color: #3b82f6;">Welcome to dSpaces</h2>
          <p style="font-size: 16px; color: #9ca3af;">Here is your secure login code. It will expire in 5 minutes.</p>
          <h1 style="font-size: 40px; letter-spacing: 5px; color: #ffffff; background-color: #1f2937; padding: 10px; border-radius: 8px; display: inline-block;">${otp}</h1>
        </div>
      `,
    });

    const res = NextResponse.json({ success: true, message: 'OTP sent successfully' });
    res.cookies.set('otp_hash', hash, { httpOnly: true, maxAge: 300 });
    res.cookies.set('otp_email', email, { httpOnly: true, maxAge: 300 });
    
    return res;
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}