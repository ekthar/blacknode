import { generateSecret, generateURI } from "otplib";
import { NextRequest, NextResponse } from "next/server";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

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

  const secret = generateSecret();
  const otpauthUrl = generateURI({
    secret,
    issuer: "BlackNodeVault",
    label: user.email,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorTempSecret: secret,
    },
  });

  return NextResponse.json({
    secret,
    otpauthUrl,
  });
}
