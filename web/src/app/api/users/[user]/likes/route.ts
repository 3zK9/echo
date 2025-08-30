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
  try {
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
    const likes = await prisma.echoLike.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      include: { echo: { include: { author: { select: { name: true, username: true, image: true } }, _count: { select: { likes: true, reposts: true } } } } },
    });
    const rows = likes.map((l) => ({
      id: l.echo.id,
      name: l.echo.author?.name || l.echo.author?.username || "User",
      handle: l.echo.author?.username || sanitizeHandle(l.echo.author?.name || undefined),
      time: relTime(l.echo.createdAt as Date),
      text: l.echo.text,
      likes: l.echo._count?.likes ?? 0,
      reposts: l.echo._count?.reposts ?? 0,
      liked: true,
      reposted: false,
      avatarUrl: l.echo.author?.image || undefined,
      originalId: l.echo.originalId || undefined,
      isRepost: !!l.echo.originalId,
    }));
    return NextResponse.json(rows, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (e) {
    return NextResponse.json([], { headers: { "Cache-Control": "private, max-age=5", "x-db-error": "unreachable" } });
  }
}
