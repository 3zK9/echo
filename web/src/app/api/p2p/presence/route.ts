import { prisma } from "@/lib/db";
import { P2P_PRESENCE_TTL_MS } from "@/lib/p2p/config";
import { presenceSigningBytes } from "@/lib/p2p/protocol";
import {
  assertBodyKeys,
  p2pErrorResponse,
  p2pJson,
  parseStoredPublicKey,
  readP2PJson,
  requireOwnedDevice,
  requireP2PMutation,
  validateIssuedAt,
  verifyDeviceProof,
} from "@/lib/p2p/server";

export async function POST(req: Request) {
  try {
    const user = await requireP2PMutation(req);
    const body = await readP2PJson(req);
    assertBodyKeys(body, ["deviceId", "issuedAt", "signature"]);
    const issuedAt = validateIssuedAt(body.issuedAt);
    const device = await requireOwnedDevice(user.id, body.deviceId);
    await verifyDeviceProof(
      parseStoredPublicKey(device.signingPublicKey, "signing"),
      presenceSigningBytes({ deviceId: device.id, issuedAt }),
      body.signature,
    );

    const onlineUntil = new Date(Date.parse(issuedAt) + P2P_PRESENCE_TTL_MS);
    if (onlineUntil.getTime() <= Date.now()) {
      return p2pJson({ error: "stale_device_proof" }, { status: 403 });
    }
    await prisma.rtcDevice.updateMany({
      where: {
        id: device.id,
        userId: user.id,
        OR: [
          { onlineUntil: null },
          { onlineUntil: { lt: onlineUntil } },
        ],
      },
      data: { onlineUntil },
    });
    const current = await prisma.rtcDevice.findUniqueOrThrow({ where: { id: device.id } });
    return p2pJson({ onlineUntil: current.onlineUntil?.toISOString() ?? onlineUntil.toISOString() });
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
