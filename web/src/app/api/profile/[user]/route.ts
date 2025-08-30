import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";

function sanitizeHandle(name?: string) {
  return (name || "user").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "user";
}

export async function GET(_: Request, { params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  let u = await prisma.user.findFirst({ where: { username: user } });
  if (!u) {
    // Resolve aliases for self: /profile/you or sanitized name fallback
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      const me = await prisma.user.findUnique({ where: { id: String((session.user as any).id) } });
      const fallback = sanitizeHandle(session.user?.name as string | undefined);
      if (me && (user.toLowerCase() === "you" || user.toLowerCase() === (fallback || "").toLowerCase())) {
        u = me;
      }
    }
  }
  if (!u) return NextResponse.json({ username: user, name: user, bio: "", link: null });
  const prof = await prisma.profile.findUnique({ where: { userId: u.id } });
  const uname = u.username || user;
  return NextResponse.json({
    username: uname,
    name: u.name || uname,
    bio: prof?.bio || "",
    link: prof?.link || null,
    avatarUrl: u.image || null,
  });
}
