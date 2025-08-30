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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const meId = (session?.user as any)?.id as string | undefined;
    const echoes = await prisma.echo.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
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
    const baseIds = echoes.map((e) => e.originalId || e.id);
    const likedSet = new Set<string>();
    const repostedSet = new Set<string>();
    if (meId && baseIds.length) {
      const likes = await prisma.echoLike.findMany({ where: { userId: meId, echoId: { in: baseIds } }, select: { echoId: true } });
      likes.forEach((l) => likedSet.add(l.echoId));
      const reposts = await prisma.echo.findMany({ where: { authorId: meId, originalId: { in: baseIds } }, select: { originalId: true } });
      reposts.forEach((r) => r.originalId && repostedSet.add(r.originalId));
    }
    const rawRows = echoes
      .filter((t) => !t.originalId || !!t.original) // drop orphan reposts where original is deleted
      .map((t) => mapEchoRow(t, likedSet, repostedSet, meId));
    // Deduplicate by base id, keep the first (most recent) occurrence
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const r of rawRows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
    return NextResponse.json(rows, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch (e) {
    return NextResponse.json([], { headers: { "Cache-Control": "private, max-age=5", "x-db-error": "unreachable" } });
  }
}

export async function POST(req: Request) {
  try {
    if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const session = await getServerSession(authOptions);
    if (!(session?.user as any)?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { text, originalId } = await req.json();
    const created = await prisma.echo.create({ data: { text: String(text || "").slice(0, 280), authorId: (session.user as any).id, originalId: originalId || null } });
    const withAuthor = await prisma.echo.findUnique({ where: { id: created.id }, include: { author: { select: { name: true, username: true, image: true } } } });
    const row = mapEchoRow({ ...withAuthor, _count: { likes: 0, reposts: 0 } }, new Set(), new Set(), (session.user as any).id);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "db_unreachable" }, { status: 503 });
  }
}
