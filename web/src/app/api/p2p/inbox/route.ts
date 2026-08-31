import { prisma } from "@/lib/db";
import { assertUuid, inboxSigningBytes, validateSignalEnvelope } from "@/lib/p2p/protocol";
import {
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

export async function POST(req: Request) {
  try {
    const user = await requireP2PMutation(req);
    const body = await readP2PJson(req);
    assertBodyKeys(body, ["deviceId", "requestId", "issuedAt", "signature"]);
    const requestId = assertUuid(body.requestId, "requestId");
    const issuedAt = validateIssuedAt(body.issuedAt);
    const device = await requireOwnedDevice(user.id, body.deviceId);
    await verifyDeviceProof(
      parseStoredPublicKey(device.signingPublicKey, "signing"),
      inboxSigningBytes({ deviceId: device.id, requestId, issuedAt }),
      body.signature,
    );
    const now = new Date();
    const [pendingInvites, signals] = await prisma.$transaction(async (transaction) => {
      // Read under the same device lock used by key replacement so a formerly
      // registered browser cannot fetch new invitation or signaling metadata
      // after its key material has been replaced.
      await lockP2PDeviceRows(transaction, [device.id]);
      await requireCurrentLockedP2PDevice(transaction, device);
      return Promise.all([
        // A CREATED row is intentionally an identity-only invitation: it gives
        // the callee enough information to compare a safety code before either
        // side constructs or applies SDP/ICE. It never carries an envelope.
        transaction.rtcSession.findMany({
          where: {
            calleeDeviceId: device.id,
            expiresAt: { gt: now },
            state: "CREATED",
          },
          orderBy: { createdAt: "asc" },
          take: 8,
          include: rtcSessionInclude,
        }),
        transaction.rtcSignal.findMany({
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
        }),
      ]);
    });

    const items = [
      ...pendingInvites.map((session) => ({ session: sessionView(session, user.id) })),
      ...signals.map((signal) => ({
        session: sessionView(signal.session, user.id),
        signal: validateSignalEnvelope(JSON.parse(signal.envelope)),
      })),
    ].slice(0, 8);
    return p2pJson({ items, serverTime: now.toISOString() });
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
