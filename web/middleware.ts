import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const isPublic = pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/assets");

  const token = await getToken({ req, secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET });
  const cookieStore = req.cookies;
  const hasSessionCookie = !!(
    cookieStore.get("__Secure-next-auth.session-token")?.value ||
    cookieStore.get("next-auth.session-token")?.value
  );
  const isLoggedIn = !!token || hasSessionCookie;

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/", nextUrl);
    url.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn) {
    const setupDone = req.cookies.get("echo_setup")?.value === "done";
    const isSetupRoute = pathname.startsWith("/setup");
    if (!setupDone && !isSetupRoute) {
      return NextResponse.redirect(new URL("/setup", nextUrl));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
