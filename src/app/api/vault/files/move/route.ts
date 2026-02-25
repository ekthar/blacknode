import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const moveFileSchema = z.object({
  fileId: z.string().min(1),
  folderId: z.string().optional(),
});

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
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
  const parsed = moveFileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { fileId, folderId } = parsed.data;

  // Verify file ownership
  const file = await prisma.vaultFile.findFirst({
    where: {
      id: fileId,
      userId: user.id,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Verify folder ownership if provided
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        userId: user.id,
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
  }

  try {
    const updatedFile = await prisma.vaultFile.update({
      where: { id: fileId },
      data: { folderId: folderId || null },
    });

    return NextResponse.json(updatedFile);
  } catch (error) {
    console.error("Move file error:", error);
    return NextResponse.json(
      { error: "Failed to move file" },
      { status: 500 }
    );
  }
}
