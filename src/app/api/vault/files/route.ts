import { NextRequest, NextResponse } from "next/server";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

  const folderId = request.nextUrl.searchParams.get("folderId") || undefined;

  const filesRaw = await prisma.vaultFile.findMany({
    where: { 
      userId: user.id,
      folderId: folderId || null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      folderId: true,
    },
  });

  const files = filesRaw.map((file: (typeof filesRaw)[number]) => ({
    ...file,
    sizeBytes: file.sizeBytes.toString(),
  }));

  return NextResponse.json({ files });
}
