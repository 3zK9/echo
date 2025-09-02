import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ count: 0 }, { status: 401 });
  const url = new URL(req.url);
  const deviceId = url.searchParams.get('deviceId');
  if (!deviceId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const device = await prisma.device.findUnique({ where: { id: String(deviceId) } });
  if (!device || device.userId !== (session.user.id as string)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const count = await prisma.preKey.count({ where: { deviceId: String(deviceId), consumedAt: null } });
  return NextResponse.json({ count });
}
