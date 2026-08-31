import { prisma } from "@/lib/db";
import {
  assertUuid,
  deviceFingerprint,
  importP256AgreementKey,
  registrationSigningBytes,
  validateP256PublicJwk,
} from "@/lib/p2p/protocol";
import {
  P2PHttpError,
  assertBodyKeys,
  canonicalDeviceKeyStorage,
  deviceIdentity,
  p2pErrorResponse,
  p2pJson,
  readP2PJson,
  lockP2PDeviceRows,
  requireCurrentLockedP2PDevice,
  requireP2PMutation,
  requireString,
  validateIssuedAt,
  verifyDeviceProof,
} from "@/lib/p2p/server";

export async function PUT(req: Request) {
  try {
    const user = await requireP2PMutation(req);
    const body = await readP2PJson(req);
    assertBodyKeys(
      body,
      ["userId", "signingPublicKey", "agreementPublicKey", "issuedAt", "signature"],
      ["deviceId", "replaceExisting"],
    );
    if (requireString(body.userId, "userId", 128) !== user.id) {
      throw new P2PHttpError(403, "forbidden");
    }

    const requestedDeviceId = body.deviceId === undefined
      ? undefined
      : assertUuid(body.deviceId, "deviceId");
    if (body.replaceExisting !== undefined && typeof body.replaceExisting !== "boolean") {
      throw new P2PHttpError(400, "invalid_request");
    }
    const replaceExisting = body.replaceExisting === true;
    const signingPublicKey = validateP256PublicJwk(body.signingPublicKey, "signing");
    const agreementPublicKey = validateP256PublicJwk(body.agreementPublicKey, "agreement");
    try {
      await importP256AgreementKey(agreementPublicKey);
    } catch {
      throw new P2PHttpError(400, "invalid_agreement_key");
    }
    const issuedAt = validateIssuedAt(body.issuedAt);
    await verifyDeviceProof(
      signingPublicKey,
      registrationSigningBytes({
        userId: user.id,
        signingPublicKey,
        agreementPublicKey,
        issuedAt,
        replaceExisting,
      }),
      body.signature,
    );

    const fingerprint = await deviceFingerprint(signingPublicKey, agreementPublicKey);
    const signingKeyJson = canonicalDeviceKeyStorage(signingPublicKey);
    const agreementKeyJson = canonicalDeviceKeyStorage(agreementPublicKey);
    const now = new Date();
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.rtcDevice.findUnique({ where: { userId: user.id } });
      if (!existing) {
        if (requestedDeviceId) {
          throw new P2PHttpError(404, "not_found");
        }
        const device = await transaction.rtcDevice.create({
          data: {
            userId: user.id,
            signingPublicKey: signingKeyJson,
            agreementPublicKey: agreementKeyJson,
            fingerprint,
          },
        });
        return { device, replaced: false };
      }
      await lockP2PDeviceRows(transaction, [existing.id]);
      const lockedExisting = await requireCurrentLockedP2PDevice(transaction, existing);
      if (requestedDeviceId && requestedDeviceId !== lockedExisting.id) {
        throw new P2PHttpError(404, "not_found");
      }

      const keysChanged = lockedExisting.fingerprint !== fingerprint ||
        lockedExisting.signingPublicKey !== signingKeyJson ||
        lockedExisting.agreementPublicKey !== agreementKeyJson;
      if (keysChanged && !replaceExisting) {
        throw new P2PHttpError(409, "device_replacement_confirmation_required");
      }
      if (keysChanged) {
        // Acquire the same row locks used by answer insertion before deleting
        // signals, so no stale encrypted answer can arrive after replacement.
        await transaction.rtcSession.updateMany({
          where: {
            state: { not: "CLOSED" },
            // The database only permits CLOSED timestamps at or before the
            // original expiry. The cron worker owns expired-row deletion, so
            // leave an already expired row untouched while still purging its
            // encrypted signaling below.
            expiresAt: { gt: now },
            OR: [{ callerUserId: user.id }, { calleeUserId: user.id }],
          },
          data: { state: "CLOSED", closedAt: now },
        });
        await transaction.rtcSignal.deleteMany({
          where: {
            session: {
              OR: [{ callerUserId: user.id }, { calleeUserId: user.id }],
            },
          },
        });
      }
      const device = await transaction.rtcDevice.update({
        where: { id: lockedExisting.id },
        data: {
          signingPublicKey: signingKeyJson,
          agreementPublicKey: agreementKeyJson,
          fingerprint,
          ...(keysChanged ? { onlineUntil: null } : {}),
        },
      });
      return { device, replaced: keysChanged };
    });

    return p2pJson({
      device: deviceIdentity(result.device, user),
      replaced: result.replaced,
    });
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
