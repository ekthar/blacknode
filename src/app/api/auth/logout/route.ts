import { NextRequest, NextResponse } from "next/server";

import { invalidateSession } from "@/lib/auth";
import { PRE_2FA_COOKIE, SESSION_COOKIE } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await invalidateSession(token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(PRE_2FA_COOKIE);
  return response;
}
