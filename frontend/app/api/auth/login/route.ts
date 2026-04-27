import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
  createAuthSession,
  hasAuthPassword,
  isSecureAuthCookie,
  isValidPassword,
  sanitizeNextPath,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));

  if (!hasAuthPassword()) {
    return NextResponse.json({ error: "请配置登录密码" }, { status: 500 });
  }

  if (!isValidPassword(payload.password)) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    next: sanitizeNextPath(payload.next),
  });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: await createAuthSession(),
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureAuthCookie(),
    path: "/",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
