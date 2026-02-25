import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createPre2FAChallenge,
  createSession,
  verifyPassword,
} from "@/lib/auth";
import { PRE_2FA_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const email = parsed.data.email;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.twoFactorEnabled) {
    const challenge = await createPre2FAChallenge(user.id);
    const response = NextResponse.json({ requires2FA: true });
    response.cookies.set(PRE_2FA_COOKIE, challenge, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300,
    });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const sessionToken = await createSession(user.id);
  const response = NextResponse.json({ ok: true, requires2FA: false });
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
