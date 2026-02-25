import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { buildObjectKey, createSignedUploadUrl } from "@/lib/r2";

const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
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
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { filename, contentType, sizeBytes } = parsed.data;
  const objectKey = buildObjectKey(user.id, filename);
  const signedUrl = await createSignedUploadUrl(objectKey, contentType);

  const file = await prisma.vaultFile.create({
    data: {
      userId: user.id,
      objectKey,
      filename,
      mimeType: contentType,
      sizeBytes: BigInt(sizeBytes),
    },
    select: {
      id: true,
      objectKey: true,
    },
  });

  return NextResponse.json({
    uploadUrl: signedUrl,
    fileId: file.id,
    objectKey: file.objectKey,
    expiresInSeconds: 120,
  });
}
