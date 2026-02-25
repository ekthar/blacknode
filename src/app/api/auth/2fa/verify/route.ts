import { verify } from "otplib";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createSession,
  verifyPre2FAChallenge,
} from "@/lib/auth";
import { PRE_2FA_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const verifySchema = z.object({
  code: z.string().min(6).max(8),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const challenge = request.cookies.get(PRE_2FA_COOKIE)?.value;
  if (!challenge) {
    return NextResponse.json({ error: "Missing 2FA challenge" }, { status: 401 });
  }

  const userId = await verifyPre2FAChallenge(challenge);
  if (!userId) {
    const response = NextResponse.json({ error: "Invalid challenge" }, { status: 401 });
    response.cookies.delete(PRE_2FA_COOKIE);
    return response;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: "2FA is not enabled" }, { status: 401 });
  }

  const valid = await verify({
    token: parsed.data.code,
    secret: user.twoFactorSecret,
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid 2FA code" }, { status: 401 });
  }

  const sessionToken = await createSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.delete(PRE_2FA_COOKIE);

  return response;
}
