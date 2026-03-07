import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const reqUrl = new URL(req.url);
  const callbackUrl = reqUrl.searchParams.get("callbackUrl");
  const target = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : "/";
  const url = new URL(target, req.url);
  const res = NextResponse.redirect(url);
  // Mark setup done; allowed in route handler
  res.cookies.set("echo_setup", "done", { path: "/", sameSite: "lax" });
  if (session?.user?.name) {
    res.cookies.set("echo_name", encodeURIComponent(session.user.name), { path: "/", sameSite: "lax" });
  }
  return res;
}
