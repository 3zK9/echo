import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { safeCallbackPath } from "@/lib/safe-redirect";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const reqUrl = new URL(req.url);
  if (!session?.user) return NextResponse.redirect(new URL("/", reqUrl.origin));

  const callbackUrl = reqUrl.searchParams.get("callbackUrl");
  const url = new URL(safeCallbackPath(callbackUrl), reqUrl.origin);
  const res = NextResponse.redirect(url);
  // This is only a server-read onboarding marker, so client JavaScript never
  // needs access to it. The signed-in session remains the authorization source.
  res.cookies.set("echo_setup", "done", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
