import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, sanitizeNextPath, verifyAuthSession } from "@/lib/auth";

function isAssetPath(pathname: string): boolean {
  return pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/robots.txt";
}

function isAuthApi(pathname: string): boolean {
  return pathname === "/api/auth/login" || pathname === "/api/auth/logout";
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAssetPath(pathname) || isAuthApi(pathname)) {
    return NextResponse.next();
  }

  const isAuthenticated = await verifyAuthSession(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (pathname === "/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL(sanitizeNextPath(request.nextUrl.searchParams.get("next")), request.url));
    }
    return NextResponse.next();
  }

  if (isAuthenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  return redirectToLogin(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
