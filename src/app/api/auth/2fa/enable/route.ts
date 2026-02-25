import { verify } from "otplib";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const enableSchema = z.object({
  code: z.string().min(6).max(8),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionToken = getSessionTokenFromRequest(request);
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserFromSessionToken(sessionToken);
  if (!user) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const body = await request.json().catch(() => null);
  const parsed = enableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!user.twoFactorTempSecret) {
    return NextResponse.json({ error: "No 2FA setup in progress" }, { status: 400 });
  }

  const valid = await verify({
    token: parsed.data.code,
    secret: user.twoFactorTempSecret,
  });

  if (!valid) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: user.twoFactorTempSecret,
      twoFactorTempSecret: null,
    },
  });

  return NextResponse.json({ ok: true });
}
