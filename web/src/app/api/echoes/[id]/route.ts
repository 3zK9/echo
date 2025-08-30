import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const echo = await prisma.echo.findUnique({ where: { id } });
  if (!echo) return NextResponse.json({ ok: true }, { status: 200 });
  if (echo.authorId !== meId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.echo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

