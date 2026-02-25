import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { createSignedDownloadUrl } from "@/lib/r2";

const downloadSchema = z.object({
  fileId: z.string().min(1),
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
  const parsed = downloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const file = await prisma.vaultFile.findFirst({
    where: {
      id: parsed.data.fileId,
      userId: user.id,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const downloadUrl = await createSignedDownloadUrl(file.objectKey);
  return NextResponse.json({
    downloadUrl,
    expiresInSeconds: 120,
  });
}
