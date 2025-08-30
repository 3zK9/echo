import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import { isAllowedMutationRequest } from "@/lib/security";

function normalizeUrl(raw: string): string | null {
  const val = String(raw || "").trim().slice(0, 200);
  if (!val) return null;
  const prefixed = /^(https?:)?\/\//i.test(val) ? val : `https://${val}`;
  try {
    const u = new URL(prefixed);
    // Basic safety: only http/https
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { link } = await req.json();
  const normalized = normalizeUrl(link);
  await prisma.profile.upsert({
    where: { userId: session.user.id },
    update: { link: normalized },
    create: { userId: session.user.id, link: normalized, bio: "" },
  });
  return NextResponse.json({ ok: true, link: normalized });
}
