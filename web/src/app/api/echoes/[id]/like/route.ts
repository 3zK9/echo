import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.echoLike.findUnique({ where: { userId_echoId: { userId: meId, echoId: id } } });
  if (existing) {
    await prisma.echoLike.delete({ where: { userId_echoId: { userId: meId, echoId: id } } });
  } else {
    await prisma.echoLike.create({ data: { userId: meId, echoId: id } });
  }
  const likes = await prisma.echoLike.count({ where: { echoId: id } });
  const liked = !!(await prisma.echoLike.findUnique({ where: { userId_echoId: { userId: meId, echoId: id } } }));
  return NextResponse.json({ likes, liked });
}
