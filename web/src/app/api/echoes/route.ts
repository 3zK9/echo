import { NextResponse } from "next/server";
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

async function mapEcho(t: any, meId?: string) {
  const likesCount = await prisma.echoLike.count({ where: { echoId: t.id } });
  const repostCount = await prisma.echo.count({ where: { originalId: t.id } });
  const likedByMe = meId ? !!(await prisma.echoLike.findUnique({ where: { userId_echoId: { userId: meId, echoId: t.id } } })) : false;
  const repostedByMe = meId ? !!(await prisma.echo.findFirst({ where: { originalId: t.id, authorId: meId } })) : false;
  const handle = t.author?.username || sanitizeHandle(t.author?.name || undefined);
  return {
    id: t.id,
    name: t.author?.name || t.author?.username || "User",
    handle,
    time: relTime(t.createdAt as Date),
    text: t.text,
    likes: likesCount,
    reposts: repostCount,
    liked: likedByMe,
    reposted: repostedByMe,
    avatarUrl: t.author?.image || undefined,
    originalId: t.originalId || undefined,
    isRepost: !!t.originalId,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const meId = (session?.user as any)?.id as string | undefined;
  const echoes = await prisma.echo.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { author: true } });
  const rows = await Promise.all(echoes.map((t) => mapEcho(t, meId)));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { text, originalId } = await req.json();
  const created = await prisma.echo.create({ data: { text: String(text || "").slice(0, 280), authorId: (session.user as any).id, originalId: originalId || null } });
  const withAuthor = await prisma.echo.findUnique({ where: { id: created.id }, include: { author: true } });
  const row = await mapEcho(withAuthor, (session.user as any).id);
  return NextResponse.json(row, { status: 201 });
}
