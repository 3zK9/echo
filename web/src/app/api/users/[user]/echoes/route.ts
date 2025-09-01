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
    if (!u) return NextResponse.json({ items: [], nextCursor: null }, { status: 200 });

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
    const cursor = url.searchParams.get("cursor") || undefined;

    const echoes = await prisma.echo.findMany({
      where: { authorId: u.id, replyToId: null },
      orderBy: { id: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: { name: true, username: true, image: true } },
        _count: { select: { likes: true, reposts: true, replies: true } },
        original: {
          include: {
            author: { select: { name: true, username: true, image: true } },
            _count: { select: { likes: true, reposts: true, replies: true } },
          },
        },
      },
    });
    const baseIds = echoes.map((t) => t.originalId || t.id);
    const likedSet = new Set<string>();
    const repostedSet = new Set<string>();
    if (meId && baseIds.length) {
      const likes = await prisma.echoLike.findMany({ where: { userId: meId, echoId: { in: baseIds } }, select: { echoId: true } });
      likes.forEach((l) => likedSet.add(l.echoId));
      const reposts = await prisma.echo.findMany({ where: { authorId: meId, originalId: { in: baseIds } }, select: { originalId: true } });
      reposts.forEach((r) => r.originalId && repostedSet.add(r.originalId));
    }
    const hasMore = echoes.length > limit;
    const page = hasMore ? echoes.slice(0, limit) : echoes;
    const rows = page
      .filter((t) => !t.originalId || !!t.original) // hide orphan reposts
      .map((t) => {
        const display = t.original ?? t;
        return {
          id: t.id, // keep unique id so original and repost both show
          name: display.author?.name || display.author?.username || "User",
          handle: display.author?.username || sanitizeHandle(display.author?.name || undefined),
          time: relTime((display.createdAt as Date) || (t.createdAt as Date)),
          text: display.text,
          likes: display._count?.likes ?? 0,
          reposts: display._count?.reposts ?? 0,
          replies: display._count?.replies ?? 0,
          liked: likedSet.has(t.originalId || t.id),
          reposted: repostedSet.has(t.originalId || t.id),
          avatarUrl: display.author?.image || undefined,
          originalId: t.originalId || undefined,
          isRepost: !!t.originalId,
          canDelete: !!meId && !t.originalId && t.authorId === meId,
        };
      });
    const nextCursor = hasMore ? echoes[limit].id : null;
    return NextResponse.json({ items: rows, nextCursor }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch {
    return NextResponse.json({ items: [], nextCursor: null }, { headers: { "Cache-Control": "private, max-age=5", "x-db-error": "unreachable" } });
  }
}
