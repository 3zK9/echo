import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ user: string }> }) {
  try {
    const { user } = await params;
    const u = await prisma.user.findFirst({ where: { username: user } });
    if (!u) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // Pick the newest device as primary for MVP
    const device = await prisma.device.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" } });
    if (!device) return NextResponse.json({ error: "no_device" }, { status: 404 });
    const spk = await prisma.signedPreKey.findFirst({ where: { deviceId: device.id }, orderBy: { createdAt: "desc" } });
    const pre = await prisma.preKey.findFirst({ where: { deviceId: device.id, consumedAt: null } });
    if (!spk || !pre) return NextResponse.json({ error: "no_prekeys" }, { status: 404 });
    // Mark the prekey as consumed
    await prisma.preKey.update({ where: { deviceId_keyId: { deviceId: device.id, keyId: pre.keyId } }, data: { consumedAt: new Date() } });
    return NextResponse.json({
      userId: u.id,
      deviceId: device.id,
      registrationId: device.registrationId,
      identityKeyPub: device.identityKeyPub,
      signedPreKey: { keyId: spk.keyId, pubKey: spk.pubKey, signature: spk.signature },
      preKey: { keyId: pre.keyId, pubKey: pre.pubKey },
    });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
