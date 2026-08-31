import { prisma } from "@/lib/db";
import { assertUuid, claimSessionSigningBytes } from "@/lib/p2p/protocol";
import {
  P2PHttpError,
  assertBodyKeys,
  lockP2PDeviceRows,
  p2pErrorResponse,
  p2pJson,
  parseStoredPublicKey,
  readP2PJson,
  requireCurrentLockedP2PDevice,
  requireOwnedDevice,
  requireP2PMutation,
  rtcSessionInclude,
  sessionView,
  validateIssuedAt,
  verifyDeviceProof,
} from "@/lib/p2p/server";

export async function POST(
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
      claimSessionSigningBytes({ deviceId: device.id, sessionId, requestId, issuedAt }),
      body.signature,
    );
    const now = new Date();
    const current = await prisma.$transaction(async (transaction) => {
      await lockP2PDeviceRows(transaction, [device.id]);
      await requireCurrentLockedP2PDevice(transaction, device);
      const session = await transaction.rtcSession.findUnique({
        where: { id: sessionId },
        include: rtcSessionInclude,
      });
      if (
        !session ||
        session.expiresAt <= now ||
        session.calleeUserId !== user.id ||
        session.calleeDeviceId !== device.id ||
        (session.state !== "OFFERED" && session.state !== "CLAIMED")
      ) {
        throw new P2PHttpError(404, "not_found");
      }

      if (session.state === "CLAIMED" && session.claimRequestId !== requestId) {
        throw new P2PHttpError(409, "claim_conflict");
      }
      if (session.state === "OFFERED") {
        const claimed = await transaction.rtcSession.updateMany({
          where: {
            id: session.id,
            state: "OFFERED",
            expiresAt: { gt: now },
          },
          data: { state: "CLAIMED", claimedAt: now, claimRequestId: requestId },
        });
        if (claimed.count !== 1) throw new P2PHttpError(409, "claim_conflict");
      }
      return transaction.rtcSession.findUniqueOrThrow({
        where: { id: session.id },
        include: rtcSessionInclude,
      });
    });
    return p2pJson({ session: sessionView(current, user.id) });
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
