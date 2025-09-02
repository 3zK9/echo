import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import { isAllowedMutationRequest } from "@/lib/security";

export async function POST(req: NextRequest) {
  if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { toUsername, senderDeviceId, ciphertext } = body || {};
    if (!toUsername || !senderDeviceId || !ciphertext) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const toUser = await prisma.user.findFirst({ where: { username: String(toUsername) } });
    if (!toUser) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await prisma.dMMessage.create({ data: {
      fromUserId: String(session.user.id),
      toUserId: toUser.id,
      senderDeviceId: String(senderDeviceId),
      ciphertext: String(ciphertext),
    }});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
