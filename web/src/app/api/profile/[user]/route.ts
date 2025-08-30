import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const u = await prisma.user.findFirst({ where: { username: user } });
  if (!u) return NextResponse.json({ username: user, name: user, bio: "" });
  const prof = await prisma.profile.findUnique({ where: { userId: u.id } });
  return NextResponse.json({ username: u.username || user, name: u.name || u.username || user, bio: prof?.bio || "", avatarUrl: u.image || null });
}

