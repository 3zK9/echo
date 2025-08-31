import { NextResponse, type NextRequest } from "next/server";
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ user: string }> }) {
  try {
    const { user } = await params;
    let u = await prisma.user.findFirst({ where: { username: user } });
    const session = await getServerSession(authOptions);
    const meId = (session?.user as any)?.id as string | undefined;
    if (!u) {
      if (session?.user?.id) {
        const me = await prisma.user.findUnique({ where: { id: String((session.user as any).id) } });
        const fallback = sanitizeHandle(session.user?.name as string | undefined);
        if (me && (user.toLowerCase() === "you" || user.toLowerCase() === (fallback || "").toLowerCase())) {
          u = me;
        }
      }
    }
    if (!u) return NextResponse.json({ items: [], nextOffset: null }, { status: 200 });

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    const likes = await prisma.echoLike.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: { echo: { include: { author: { select: { name: true, username: true, image: true } }, _count: { select: { likes: true, reposts: true } }, original: { include: { author: { select: { name: true, username: true, image: true } }, _count: { select: { likes: true, reposts: true } } } } } } },
    });
    const rows = likes
      .filter((l) => !l.echo.originalId)
      .map((l) => {
        const e = l.echo;
        const display = e.original ?? e;
        return {
          id: e.originalId || e.id,
          name: display.author?.name || display.author?.username || "User",
          handle: display.author?.username || sanitizeHandle(display.author?.name || undefined),
          time: relTime((display.createdAt as Date) || (e.createdAt as Date)),
          text: display.text,
          likes: display._count?.likes ?? 0,
          reposts: display._count?.reposts ?? 0,
          liked: true,
          reposted: false,
          avatarUrl: display.author?.image || undefined,
          originalId: e.originalId || undefined,
          isRepost: !!e.originalId,
          canDelete: !!meId && !e.originalId && e.authorId === meId,
        };
      });
    const nextOffset = rows.length === limit ? offset + limit : null;
    return NextResponse.json({ items: rows, nextOffset }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (_e) {
    return NextResponse.json({ items: [], nextOffset: null }, { headers: { "Cache-Control": "private, max-age=5", "x-db-error": "unreachable" } });
  }
}
