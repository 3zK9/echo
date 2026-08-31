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
  cleanupExpiredP2P,
  deviceIdentity,
  p2pErrorResponse,
  p2pJson,
  readP2PJson,
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
    await cleanupExpiredP2P();

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
      if (requestedDeviceId && requestedDeviceId !== existing.id) {
        throw new P2PHttpError(404, "not_found");
      }

      const keysChanged = existing.fingerprint !== fingerprint ||
        existing.signingPublicKey !== signingKeyJson ||
        existing.agreementPublicKey !== agreementKeyJson;
      if (keysChanged && !replaceExisting) {
        throw new P2PHttpError(409, "device_replacement_confirmation_required");
      }
      if (keysChanged) {
        // Acquire the same row locks used by answer insertion before deleting
        // signals, so no stale encrypted answer can arrive after replacement.
        await transaction.rtcSession.updateMany({
          where: {
            state: { not: "CLOSED" },
            OR: [{ callerUserId: user.id }, { calleeUserId: user.id }],
          },
          data: { state: "CLOSED", closedAt: new Date() },
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
        where: { id: existing.id },
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
