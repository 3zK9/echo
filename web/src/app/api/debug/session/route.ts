import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { getToken } from "next-auth/jwt";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req: req as any, secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET });
  return NextResponse.json({
    hasSession: !!session,
    sessionUser: session?.user || null,
    hasToken: !!token,
    tokenSub: (token as any)?.sub || null,
    env: {
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      hasAuthSecret: !!process.env.AUTH_SECRET,
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    },
  });
}

