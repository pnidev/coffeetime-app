// proxy.ts (Next.js 16+ replacement for middleware.ts)
// Bảo vệ route /staff bằng cookie PIN đơn giản
// Không dùng Supabase Auth — chỉ check cookie "staff_auth"

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOGIN_PATH = "/staff/login";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Chỉ chặn /staff/* (nhưng không chặn /staff/login)
  const isProtected =
    pathname.startsWith("/staff") && pathname !== LOGIN_PATH && !pathname.startsWith("/staff/login");

  if (!isProtected) return NextResponse.next();

  const authCookie = request.cookies.get("staff_auth");
  const isAuthenticated = authCookie?.value === "authenticated";

  if (!isAuthenticated) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*"],
};
