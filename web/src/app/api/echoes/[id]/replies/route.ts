import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const meId = (session?.user as any)?.id as string | undefined;
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
    const cursor = url.searchParams.get("cursor") || undefined;
    const replies = await prisma.echo.findMany({
      where: { replyToId: id },
      orderBy: { id: "asc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: { name: true, username: true, image: true } },
        _count: { select: { likes: true, reposts: true, replies: true } },
      },
    });
    const hasMore = replies.length > limit;
    const page = hasMore ? replies.slice(0, limit) : replies;
    const likedIds = meId && page.length ? await prisma.echoLike.findMany({ where: { userId: meId, echoId: { in: page.map((r) => r.id) } }, select: { echoId: true } }) : [];
    const likedSet = new Set(likedIds.map((l) => l.echoId));
    const items = page.map((r) => ({
      id: r.id,
      name: r.author?.name || r.author?.username || "User",
      handle: r.author?.username || sanitizeHandle(r.author?.name || undefined),
      time: relTime(r.createdAt as Date),
      text: r.text,
      likes: (r as any)._count?.likes ?? 0,
      reposts: (r as any)._count?.reposts ?? 0,
      replies: (r as any)._count?.replies ?? 0,
      liked: likedSet.has(r.id),
      reposted: false,
      avatarUrl: r.author?.image || undefined,
      originalId: undefined,
      isRepost: false,
      canDelete: !!meId && r.authorId === meId,
    }));
    const nextCursor = hasMore ? replies[limit].id : null;
    return NextResponse.json({ items, nextCursor }, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch {
    return NextResponse.json({ items: [], nextCursor: null }, { headers: { "Cache-Control": "private, max-age=5" } });
  }
}

