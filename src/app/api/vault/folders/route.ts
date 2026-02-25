import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSessionTokenFromRequest, getUserFromSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().optional(),
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
  const parsed = createFolderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { name, parentId } = parsed.data;

  // Validate parent folder ownership
  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: {
        id: parentId,
        userId: user.id,
      },
    });

    if (!parent) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
  }

  try {
    const folder = await prisma.folder.create({
      data: {
        name,
        userId: user.id,
        parentId: parentId || null,
      },
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Folder with this name already exists in this location" },
        { status: 409 }
      );
    }

    console.error("Create folder error:", error);
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}

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

  const parentId = request.nextUrl.searchParams.get("parentId") || undefined;

  const folders = await prisma.folder.findMany({
    where: {
      userId: user.id,
      parentId: parentId || null,
    },
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json({ folders });
}
