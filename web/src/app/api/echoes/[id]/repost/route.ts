import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Toggle repost: if I already have an echo with originalId = id, delete it; otherwise create one
  const mine = await prisma.echo.findFirst({ where: { authorId: meId, originalId: id } });
  if (mine) {
    await prisma.echo.delete({ where: { id: mine.id } });
  } else {
    await prisma.echo.create({ data: { text: "", authorId: meId, originalId: id } });
  }

  const reposts = await prisma.echo.count({ where: { originalId: id } });
  const reposted = !!(await prisma.echo.findFirst({ where: { originalId: id, authorId: meId } }));
  return NextResponse.json({ reposts, reposted });
}

