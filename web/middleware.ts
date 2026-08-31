import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function buildCallbackUrl(nextUrl: URL) {
  return `${nextUrl.pathname}${nextUrl.search}`;
}

function shouldBypassSetup(pathname: string) {
  return pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/assets");
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function protectAdminResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const adminPath = isAdminPath(pathname);

  if (adminPath && req.method !== "GET" && req.method !== "HEAD") {
    return protectAdminResponse(new NextResponse(null, {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    }));
  }

  const isPublic = pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/assets");

  const token = await getToken({ req, secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET });
  const isLoggedIn = !!token;

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/", nextUrl);
    url.searchParams.set("callbackUrl", buildCallbackUrl(nextUrl));
    const response = NextResponse.redirect(url);
    return adminPath ? protectAdminResponse(response) : response;
  }

  if (isLoggedIn) {
    const setupDone = req.cookies.get("echo_setup")?.value === "done";
    const isSetupRoute = pathname.startsWith("/setup");
    if (!setupDone && !isSetupRoute && !shouldBypassSetup(pathname)) {
      const url = new URL("/setup", nextUrl);
      url.searchParams.set("callbackUrl", buildCallbackUrl(nextUrl));
      const response = NextResponse.redirect(url);
      return adminPath ? protectAdminResponse(response) : response;
    }
  }

  const response = NextResponse.next();
  return adminPath ? protectAdminResponse(response) : response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
