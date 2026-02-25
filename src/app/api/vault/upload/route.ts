import { NextRequest, NextResponse } from "next/server";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { buildObjectKey, uploadObjectToR2 } from "@/lib/r2";

const maxUploadBytes = 25 * 1024 * 1024;

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

  const formData = await request.formData().catch(() => null);
  const fileValue = formData?.get("file");
  const folderId = formData?.get("folderId");

  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (fileValue.size <= 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  if (fileValue.size > maxUploadBytes) {
    return NextResponse.json(
      { error: `File too large. Max size is ${Math.floor(maxUploadBytes / (1024 * 1024))}MB.` },
      { status: 400 },
    );
  }

  // Verify folder ownership if provided
  if (folderId && typeof folderId === "string") {
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

  const contentType = fileValue.type || "application/octet-stream";
  const objectKey = buildObjectKey(user.id, fileValue.name);

  try {
    const bytes = new Uint8Array(await fileValue.arrayBuffer());
    await uploadObjectToR2(objectKey, contentType, bytes);

    const file = await prisma.vaultFile.create({
      data: {
        userId: user.id,
        folderId: folderId ? String(folderId) : null,
        objectKey,
        filename: fileValue.name,
        mimeType: contentType,
        sizeBytes: BigInt(fileValue.size),
      },
      select: {
        id: true,
        filename: true,
      },
    });

    return NextResponse.json({ ok: true, file });
  } catch {
    return NextResponse.json({ error: "Upload failed. Check R2 credentials and bucket permissions." }, { status: 500 });
  }
}
