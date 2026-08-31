import { prisma } from "@/lib/db";
import { validateSignalEnvelope } from "@/lib/p2p/protocol";
import {
  p2pErrorResponse,
  p2pJson,
  requireOwnedDevice,
  requireP2PUser,
  rtcSessionInclude,
  sessionView,
} from "@/lib/p2p/server";

export async function GET(req: Request) {
  try {
    const user = await requireP2PUser();
    const url = new URL(req.url);
    const device = await requireOwnedDevice(user.id, url.searchParams.get("deviceId"));
    const now = new Date();
    const signals = await prisma.rtcSignal.findMany({
      where: {
        recipientDeviceId: device.id,
        expiresAt: { gt: now },
        session: {
          expiresAt: { gt: now },
          state: { in: ["OFFERED", "CLAIMED"] },
        },
      },
      orderBy: { id: "asc" },
      take: 8,
      include: {
        session: { include: rtcSessionInclude },
      },
    });

    const items = signals.map((signal) => ({
      session: sessionView(signal.session, user.id),
      signal: validateSignalEnvelope(JSON.parse(signal.envelope)),
    }));
    return p2pJson({ items, serverTime: now.toISOString() });
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
