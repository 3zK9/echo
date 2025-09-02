import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import { isAllowedMutationRequest } from "@/lib/security";

export async function POST(req: Request) {
  if (!isAllowedMutationRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;
  try {
    const body = await req.json();
    const { deviceId, preKeys } = body || {};
    if (!deviceId || !Array.isArray(preKeys)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const device = await prisma.device.findUnique({ where: { id: String(deviceId) } });
    if (!device || device.userId !== userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    for (const pk of preKeys) {
      if (pk?.keyId && pk?.pubKey) {
        await prisma.preKey.upsert({
          where: { deviceId_keyId: { deviceId: String(deviceId), keyId: Number(pk.keyId) } },
          create: { deviceId: String(deviceId), keyId: Number(pk.keyId), pubKey: String(pk.pubKey) },
          update: { pubKey: String(pk.pubKey), consumedAt: null },
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
