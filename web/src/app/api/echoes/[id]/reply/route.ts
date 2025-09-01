import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import { isAllowedMutationRequest } from "@/lib/security";

function sanitizeHandle(name?: string) {
  return (name || "user").toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 12) || "user";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession(authOptions);
  const { id } = await params;
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { text } = await req.json();
  let body = String(text || "").slice(0, 280);
  try {
    const parent = await prisma.echo.findUnique({ where: { id }, include: { author: { select: { username: true, name: true } } } });
    if (!parent) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const handle = parent.author?.username || sanitizeHandle(parent.author?.name || undefined);
    const prefix = `@${handle}`;
    if (!body.trimStart().toLowerCase().startsWith(prefix.toLowerCase())) {
      body = `${prefix} ${body}`.slice(0, 280);
    }
    await prisma.echo.create({ data: { text: body, authorId: meId, replyToId: id } });
    const replies = await prisma.echo.count({ where: { replyToId: id } });
    return NextResponse.json({ ok: true, replies });
  } catch {
    return NextResponse.json({ error: "db_unreachable" }, { status: 503 });
  }
}
