import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ user: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ items: [], nextCursor: null }, { status: 401 });
  const { user } = await params;
  const peer = await prisma.user.findFirst({ where: { username: user } });
  if (!peer) return NextResponse.json({ items: [], nextCursor: null });
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10)));
  const cursor = url.searchParams.get("cursor") || undefined;
  const meId = String(session.user.id);
  const peerId = peer.id;
  const msgs = await prisma.dMMessage.findMany({
    where: {
      OR: [
        { fromUserId: meId, toUserId: peerId },
        { fromUserId: peerId, toUserId: meId },
      ],
    },
    orderBy: { sentAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = msgs.length > limit;
  const page = hasMore ? msgs.slice(0, limit) : msgs;
  const items = page.map(m => ({
    id: m.id,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    senderDeviceId: m.senderDeviceId,
    ciphertext: m.ciphertext,
    sentAt: m.sentAt,
  }));
  const nextCursor = hasMore ? msgs[limit].id : null;
  return NextResponse.json({ items, nextCursor }, { headers: { "Cache-Control": "private, max-age=5" } });
}
