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
    const { deviceId, registrationId, identityKeyPub, signedPreKey, preKeys } = body || {};
    if (!deviceId || !registrationId || !identityKeyPub || !signedPreKey?.keyId || !signedPreKey?.pubKey || !signedPreKey?.signature) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    await prisma.device.upsert({
      where: { id: String(deviceId) },
      create: { id: String(deviceId), userId, registrationId: Number(registrationId), identityKeyPub: String(identityKeyPub) },
      update: { userId, registrationId: Number(registrationId), identityKeyPub: String(identityKeyPub) },
    });
    await prisma.signedPreKey.upsert({
      where: { deviceId_keyId: { deviceId: String(deviceId), keyId: Number(signedPreKey.keyId) } },
      create: { deviceId: String(deviceId), keyId: Number(signedPreKey.keyId), pubKey: String(signedPreKey.pubKey), signature: String(signedPreKey.signature) },
      update: { pubKey: String(signedPreKey.pubKey), signature: String(signedPreKey.signature) },
    });
    if (Array.isArray(preKeys)) {
      for (const pk of preKeys) {
        if (pk?.keyId && pk?.pubKey) {
          await prisma.preKey.upsert({
            where: { deviceId_keyId: { deviceId: String(deviceId), keyId: Number(pk.keyId) } },
            create: { deviceId: String(deviceId), keyId: Number(pk.keyId), pubKey: String(pk.pubKey) },
            update: { pubKey: String(pk.pubKey) },
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
