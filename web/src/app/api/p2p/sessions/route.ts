import { P2P_SESSION_TTL_MS } from "@/lib/p2p/config";
import {
  assertUuid,
  createSessionSigningBytes,
  normalizeGithubUsername,
} from "@/lib/p2p/protocol";
import {
  P2PHttpError,
  assertBodyKeys,
  cleanupExpiredP2P,
  p2pErrorResponse,
  p2pJson,
  p2pPairKey,
  parseStoredPublicKey,
  readP2PJson,
  requireOwnedDevice,
  requireP2PMutation,
  rtcSessionInclude,
  sessionView,
  validateIssuedAt,
  verifyDeviceProof,
  withSerializableRetry,
} from "@/lib/p2p/server";

export async function POST(req: Request) {
  try {
    const user = await requireP2PMutation(req);
    const body = await readP2PJson(req);
    assertBodyKeys(body, ["deviceId", "targetUsername", "requestId", "issuedAt", "signature"]);
    const targetUsername = normalizeGithubUsername(body.targetUsername);
    const requestId = assertUuid(body.requestId, "requestId");
    const issuedAt = validateIssuedAt(body.issuedAt);
    const callerDevice = await requireOwnedDevice(user.id, body.deviceId);
    await verifyDeviceProof(
      parseStoredPublicKey(callerDevice.signingPublicKey, "signing"),
      createSessionSigningBytes({
        deviceId: callerDevice.id,
        targetUsername,
        requestId,
        issuedAt,
      }),
      body.signature,
    );

    await cleanupExpiredP2P();
    const now = new Date();
    const session = await withSerializableRetry(async (transaction) => {
      const duplicate = await transaction.rtcSession.findUnique({
        where: {
          callerDeviceId_createRequestId: {
            callerDeviceId: callerDevice.id,
            createRequestId: requestId,
          },
        },
        include: rtcSessionInclude,
      });
      if (duplicate) {
        if (
          duplicate.state === "CLOSED" ||
          duplicate.callee.username?.toLowerCase() !== targetUsername
        ) {
          throw new P2PHttpError(409, "request_conflict");
        }
        return duplicate;
      }

      const targets = await transaction.user.findMany({
        where: {
          id: { not: user.id },
          username: { equals: targetUsername, mode: "insensitive" },
          accounts: { some: { provider: "github" } },
        },
        select: {
          id: true,
          username: true,
          rtcDevice: true,
        },
        take: 2,
      });
      const target = targets.length === 1 ? targets[0] : null;
      if (!target?.username || !target.rtcDevice?.onlineUntil || target.rtcDevice.onlineUntil <= now) {
        throw new P2PHttpError(409, "peer_unavailable");
      }

      const pairKey = p2pPairKey(user.id, target.id);
      const recoverable = await transaction.rtcSession.findFirst({
        where: {
          pairKey,
          callerUserId: user.id,
          callerDeviceId: callerDevice.id,
          calleeUserId: target.id,
          calleeDeviceId: target.rtcDevice.id,
          state: { not: "CLOSED" },
          expiresAt: { gt: now },
        },
        include: rtcSessionInclude,
      });
      // A response-lost retry may have a new request ID. Recover the same
      // server-generated session rather than stranding the pair for ten
      // minutes or minting a second session ID.
      if (recoverable) return recoverable;

      const activeCount = await transaction.rtcSession.count({
        where: {
          expiresAt: { gt: now },
          state: { not: "CLOSED" },
          OR: [
            { callerUserId: user.id },
            { calleeUserId: user.id },
          ],
        },
      });
      if (activeCount >= 3) throw new P2PHttpError(429, "rate_limited");
      const recentCount = await transaction.rtcSession.count({
        where: {
          callerUserId: user.id,
          createdAt: { gte: new Date(now.getTime() - 60_000) },
        },
      });
      if (recentCount >= 5) throw new P2PHttpError(429, "rate_limited");

      const targetActiveCount = await transaction.rtcSession.count({
        where: {
          expiresAt: { gt: now },
          state: { not: "CLOSED" },
          OR: [
            { callerUserId: target.id },
            { calleeUserId: target.id },
          ],
        },
      });
      const targetRecentInboundCount = await transaction.rtcSession.count({
        where: {
          calleeUserId: target.id,
          createdAt: { gte: new Date(now.getTime() - 60_000) },
        },
      });
      if (targetActiveCount >= 3 || targetRecentInboundCount >= 5) {
        throw new P2PHttpError(409, "peer_unavailable");
      }

      return transaction.rtcSession.create({
        data: {
          callerUserId: user.id,
          calleeUserId: target.id,
          callerDeviceId: callerDevice.id,
          calleeDeviceId: target.rtcDevice.id,
          createRequestId: requestId,
          pairKey,
          expiresAt: new Date(now.getTime() + P2P_SESSION_TTL_MS),
        },
        include: rtcSessionInclude,
      });
    });

    if (session.callerUserId !== user.id || session.callerDeviceId !== callerDevice.id) {
      throw new P2PHttpError(409, "request_conflict");
    }
    return p2pJson({ session: sessionView(session, user.id) }, { status: 201 });
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
