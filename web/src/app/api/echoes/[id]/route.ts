import { NextResponse, type NextRequest } from "next/server";
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = await prisma.echo.findUnique({
      where: { id },
      include: {
        author: { select: { name: true, username: true, image: true } },
        _count: { select: { likes: true, reposts: true, replies: true } },
      },
    });
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const data = {
      id: row.id,
      name: row.author?.name || row.author?.username || "User",
      handle: row.author?.username || sanitizeHandle(row.author?.name || undefined),
      time: relTime(row.createdAt as Date),
      text: row.text,
      likes: (row as any)._count?.likes ?? 0,
      reposts: (row as any)._count?.reposts ?? 0,
      replies: (row as any)._count?.replies ?? 0,
      liked: false,
      reposted: false,
      avatarUrl: row.author?.image || undefined,
      originalId: undefined,
      isRepost: false,
      canDelete: false,
    };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "db_unreachable" }, { status: 503 });
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession(authOptions);
  const { id } = await params;
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const echo = await prisma.echo.findUnique({ where: { id } });
  if (!echo) return NextResponse.json({ ok: true }, { status: 200 });
  if (echo.authorId !== meId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Remove any reposts that reference this echo to avoid orphaned reposts
  await prisma.echo.deleteMany({ where: { originalId: id } });
  await prisma.echo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
