import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const sessionTtlDays = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.authJwtSecret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return token;
}

export async function invalidateSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function getUserFromSessionToken(token: string) {
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return session.user;
}

export function getSessionTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function createPre2FAChallenge(userId: string): Promise<string> {
  return new SignJWT({ userId, stage: "pre2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getJwtSecret());
}

export async function verifyPre2FAChallenge(token: string): Promise<string | null> {
  try {
    const result = await jwtVerify(token, getJwtSecret());
    const payload = result.payload as { userId?: string; stage?: string };
    if (payload.stage !== "pre2fa" || !payload.userId) {
      return null;
    }
    return payload.userId;
  } catch {
    return null;
  }
}
