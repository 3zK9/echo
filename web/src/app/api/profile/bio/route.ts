import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import { isAllowedMutationRequest } from "@/lib/security";

export async function POST(req: Request) {
  if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { bio } = await req.json();
  const val = String(bio || "").slice(0, 280);
  await prisma.profile.upsert({ where: { userId: session.user.id }, update: { bio: val }, create: { userId: session.user.id, bio: val } });
  return NextResponse.json({ ok: true });
}
