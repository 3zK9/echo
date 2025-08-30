import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";

function sanitizeHandle(name?: string) {
  return (name || "user").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "user";
}

function relTime(d: Date) {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export async function GET(_: Request, { params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  let u = await prisma.user.findFirst({ where: { username: user } });
  if (!u) {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      const me = await prisma.user.findUnique({ where: { id: String((session.user as any).id) } });
      const fallback = sanitizeHandle(session.user?.name as string | undefined);
      if (me && (user.toLowerCase() === "you" || user.toLowerCase() === (fallback || "").toLowerCase())) {
        u = me;
      }
    }
  }
  if (!u) return NextResponse.json([], { status: 200 });
  const likes = await prisma.echoLike.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, include: { echo: { include: { author: true } } } });
  const rows = await Promise.all(likes.map(async (l) => ({
    id: l.echo.id,
    name: l.echo.author?.name || l.echo.author?.username || "User",
    handle: l.echo.author?.username || sanitizeHandle(l.echo.author?.name || undefined),
    time: relTime(l.echo.createdAt as Date),
    text: l.echo.text,
    likes: await prisma.echoLike.count({ where: { echoId: l.echo.id } }),
    reposts: await prisma.echo.count({ where: { originalId: l.echo.id } }),
    liked: true,
    reposted: false,
    avatarUrl: l.echo.author?.image || undefined,
    originalId: l.echo.originalId || undefined,
    isRepost: !!l.echo.originalId,
  })));
  return NextResponse.json(rows);
}
