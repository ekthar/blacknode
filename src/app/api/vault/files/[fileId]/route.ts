import { NextRequest, NextResponse } from "next/server";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { deleteObjectFromR2 } from "@/lib/r2";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
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

  const { fileId } = await params;

  if (!fileId) {
    return NextResponse.json({ error: "File ID required" }, { status: 400 });
  }

  const file = await prisma.vaultFile.findFirst({
    where: {
      id: fileId,
      userId: user.id,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    // Delete from R2
    await deleteObjectFromR2(file.objectKey);

    // Delete from database
    await prisma.vaultFile.delete({
      where: {
        id: fileId,
      },
    });

    return NextResponse.json({ success: true, message: "File deleted" });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
