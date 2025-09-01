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
      where: { authorId: u.id, NOT: { replyToId: null } },
      orderBy: { id: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: { name: true, username: true, image: true } },
        _count: { select: { likes: true, reposts: true, replies: true } },
      },
    });
    const likedSet = new Set<string>();
    if (meId && echoes.length) {
      const likes = await prisma.echoLike.findMany({ where: { userId: meId, echoId: { in: echoes.map((e) => e.id) } }, select: { echoId: true } });
      likes.forEach((l) => likedSet.add(l.echoId));
    }
    const hasMore = echoes.length > limit;
    const page = hasMore ? echoes.slice(0, limit) : echoes;
    const rows = page.map((t) => ({
      id: t.id,
      name: t.author?.name || t.author?.username || "User",
      handle: t.author?.username || sanitizeHandle(t.author?.name || undefined),
      time: relTime((t.createdAt as Date)),
      text: t.text,
      likes: (t as any)._count?.likes ?? 0,
      reposts: (t as any)._count?.reposts ?? 0,
      replies: (t as any)._count?.replies ?? 0,
      liked: likedSet.has(t.id),
      reposted: false,
      avatarUrl: t.author?.image || undefined,
      originalId: undefined,
      isRepost: false,
      canDelete: !!meId && t.authorId === meId,
    }));
    const nextCursor = hasMore ? echoes[limit].id : null;
    return NextResponse.json({ items: rows, nextCursor }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch {
    return NextResponse.json({ items: [], nextCursor: null }, { headers: { "Cache-Control": "private, max-age=5", "x-db-error": "unreachable" } });
  }
}
