import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ user: string }> }) {
  try {
    const { user } = await params;
    const u = await prisma.user.findFirst({ where: { username: user } });
    if (!u) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const device = await prisma.device.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, select: { id: true, registrationId: true, identityKeyPub: true } });
    if (!device) return NextResponse.json({ error: "no_device" }, { status: 404 });
    return NextResponse.json({ userId: u.id, deviceId: device.id, registrationId: device.registrationId, identityKeyPub: device.identityKeyPub });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
