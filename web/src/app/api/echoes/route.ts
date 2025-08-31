import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import { isAllowedMutationRequest } from "@/lib/security";

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

function mapEchoRow(t: any, likedSet: Set<string>, repostedSet: Set<string>, meId?: string) {
  const baseId = t.originalId || t.id;
  const display = t.original ?? t;
  const handle = display.author?.username || sanitizeHandle(display.author?.name || undefined);
  return {
    id: baseId,
    name: display.author?.name || display.author?.username || "User",
    handle,
    time: relTime((display.createdAt as Date) || (t.createdAt as Date)),
    text: display.text,
    likes: display._count?.likes ?? 0,
    reposts: display._count?.reposts ?? 0,
    liked: likedSet.has(baseId),
    reposted: repostedSet.has(baseId),
    avatarUrl: display.author?.image || undefined,
    originalId: t.originalId || undefined,
    isRepost: !!t.originalId,
    canDelete: !!meId && !t.originalId && t.authorId === meId,
  };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const meId = (session?.user as any)?.id as string | undefined;
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
    const cursor = url.searchParams.get("cursor") || undefined;
    const echoes = await prisma.echo.findMany({
      orderBy: { id: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: { name: true, username: true, image: true } },
        _count: { select: { likes: true, reposts: true } },
        original: {
          include: {
            author: { select: { name: true, username: true, image: true } },
            _count: { select: { likes: true, reposts: true } },
          },
        },
      },
    });
    const hasMore = echoes.length > limit;
    const page = hasMore ? echoes.slice(0, limit) : echoes;
    const baseIds = page.map((e) => e.originalId || e.id);
    const likedSet = new Set<string>();
    const repostedSet = new Set<string>();
    if (meId && baseIds.length) {
      const likes = await prisma.echoLike.findMany({ where: { userId: meId, echoId: { in: baseIds } }, select: { echoId: true } });
      likes.forEach((l) => likedSet.add(l.echoId));
      const reposts = await prisma.echo.findMany({ where: { authorId: meId, originalId: { in: baseIds } }, select: { originalId: true } });
      reposts.forEach((r) => r.originalId && repostedSet.add(r.originalId));
    }
    const items = page
      .filter((t) => !t.originalId || !!t.original)
      .map((t) => mapEchoRow(t, likedSet, repostedSet, meId));
    const nextCursor = hasMore ? echoes[limit].id : null;
    return NextResponse.json({ items, nextCursor }, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch (_e) {
    return NextResponse.json({ items: [], nextCursor: null }, { headers: { "Cache-Control": "private, max-age=5", "x-db-error": "unreachable" } });
  }
}

export async function POST(req: Request) {
  try {
    if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const session = await getServerSession(authOptions);
    if (!(session?.user as any)?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = (session!.user as any).id as string;
    const { text, originalId } = await req.json();
    const created = await prisma.echo.create({ data: { text: String(text || "").slice(0, 280), authorId: userId, originalId: originalId || null } });
    const withAuthor = await prisma.echo.findUnique({ where: { id: created.id }, include: { author: { select: { name: true, username: true, image: true } } } });
    const row = mapEchoRow({ ...withAuthor, _count: { likes: 0, reposts: 0 } }, new Set(), new Set(), userId);
    return NextResponse.json(row, { status: 201 });
  } catch (_e) {
    return NextResponse.json({ error: "db_unreachable" }, { status: 503 });
  }
}
