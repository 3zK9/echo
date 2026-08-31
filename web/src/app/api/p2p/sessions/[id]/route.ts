import { prisma } from "@/lib/db";
import { assertUuid, closeSessionSigningBytes } from "@/lib/p2p/protocol";
import {
  assertBodyKeys,
  cleanupExpiredP2P,
  p2pEmpty,
  p2pErrorResponse,
  parseStoredPublicKey,
  readP2PJson,
  requireOwnedDevice,
  requireP2PMutation,
  validateIssuedAt,
  verifyDeviceProof,
} from "@/lib/p2p/server";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireP2PMutation(req);
    const { id: rawSessionId } = await params;
    const sessionId = assertUuid(rawSessionId, "sessionId");
    const body = await readP2PJson(req);
    assertBodyKeys(body, ["deviceId", "requestId", "issuedAt", "signature"]);
    const requestId = assertUuid(body.requestId, "requestId");
    const issuedAt = validateIssuedAt(body.issuedAt);
    const device = await requireOwnedDevice(user.id, body.deviceId);
    await verifyDeviceProof(
      parseStoredPublicKey(device.signingPublicKey, "signing"),
      closeSessionSigningBytes({ deviceId: device.id, sessionId, requestId, issuedAt }),
      body.signature,
    );

    await cleanupExpiredP2P();
    await prisma.$transaction(async (transaction) => {
      const participant = {
        id: sessionId,
        OR: [
          { callerUserId: user.id, callerDeviceId: device.id },
          { calleeUserId: user.id, calleeDeviceId: device.id },
        ],
      };
      // Lock/close before deleting signals. An in-flight answer takes the same
      // session lock immediately before inserting; this ordering guarantees it
      // either observes CLOSED and fails, or commits first and is then deleted
      // by this transaction. The two changes become visible together at commit.
      await transaction.rtcSession.updateMany({
        where: { ...participant, state: { not: "CLOSED" } },
        data: { state: "CLOSED", closedAt: new Date() },
      });
      // Encrypted signaling is physically removed immediately. The bounded
      // CLOSED row is only an idempotency/rate-limit tombstone and is deleted
      // at the session's original ten-minute expiry.
      await transaction.rtcSignal.deleteMany({ where: { session: participant } });
    });
    return p2pEmpty();
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
