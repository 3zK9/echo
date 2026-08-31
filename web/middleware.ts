import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { buildContentSecurityPolicy } from "@/lib/content-security-policy";

function requestSecurityContext(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const requestHeaders = new Headers(request.headers);

  // Next.js reads both request headers to apply the matching nonce to its
  // framework scripts, inline hydration data, and generated style elements.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  return { contentSecurityPolicy, requestHeaders };
}

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

function protectResponse(
  response: NextResponse,
  contentSecurityPolicy: string,
  adminPath: boolean,
) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return adminPath ? protectAdminResponse(response) : response;
}

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const adminPath = isAdminPath(pathname);
  const { contentSecurityPolicy, requestHeaders } = requestSecurityContext(req);

  if (adminPath && req.method !== "GET" && req.method !== "HEAD") {
    return protectResponse(new NextResponse(null, {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    }), contentSecurityPolicy, true);
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
    return protectResponse(response, contentSecurityPolicy, adminPath);
  }

  if (isLoggedIn) {
    const setupDone = req.cookies.get("echo_setup")?.value === "done";
    const isSetupRoute = pathname.startsWith("/setup");
    if (!setupDone && !isSetupRoute && !shouldBypassSetup(pathname)) {
      const url = new URL("/setup", nextUrl);
      url.searchParams.set("callbackUrl", buildCallbackUrl(nextUrl));
      const response = NextResponse.redirect(url);
      return protectResponse(response, contentSecurityPolicy, adminPath);
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return protectResponse(response, contentSecurityPolicy, adminPath);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
