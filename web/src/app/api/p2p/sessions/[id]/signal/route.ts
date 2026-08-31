import { prisma } from "@/lib/db";
import { MAX_SIGNAL_REQUEST_BYTES } from "@/lib/p2p/config";
import {
  assertUuid,
  signalEnvelopeHash,
  signalSigningBytes,
  validateSignalEnvelope,
} from "@/lib/p2p/protocol";
import {
  P2PHttpError,
  assertBodyKeys,
  cleanupExpiredP2P,
  p2pErrorResponse,
  p2pJson,
  parseStoredPublicKey,
  readP2PJson,
  requireP2PMutation,
  rtcSessionInclude,
  signalMetadata,
  verifyDeviceProof,
  withSerializableRetry,
} from "@/lib/p2p/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireP2PMutation(req);
    const { id: rawSessionId } = await params;
    const sessionId = assertUuid(rawSessionId, "sessionId");
    const body = await readP2PJson(req, MAX_SIGNAL_REQUEST_BYTES);
    assertBodyKeys(body, ["envelope"]);
    const envelope = validateSignalEnvelope(body.envelope);
    if (envelope.sessionId !== sessionId) throw new P2PHttpError(404, "not_found");
    await cleanupExpiredP2P();

    const session = await prisma.rtcSession.findUnique({
      where: { id: sessionId },
      include: rtcSessionInclude,
    });
    const now = new Date();
    if (!session || session.expiresAt <= now) throw new P2PHttpError(404, "not_found");

    const offer = envelope.phase === "offer";
    const expectedUserId = offer ? session.callerUserId : session.calleeUserId;
    const expectedState = offer ? "CREATED" : "CLAIMED";
    if (user.id !== expectedUserId) throw new P2PHttpError(404, "not_found");

    let offerHash: string | undefined;
    if (!offer) {
      const storedOffer = await prisma.rtcSignal.findUnique({
        where: { sessionId_phase: { sessionId, phase: "OFFER" } },
      });
      if (!storedOffer) throw new P2PHttpError(409, "offer_required");
      offerHash = await signalEnvelopeHash(validateSignalEnvelope(JSON.parse(storedOffer.envelope)));
      if (envelope.offerHash !== offerHash) {
        throw new P2PHttpError(409, "offer_binding_mismatch");
      }
    }

    const metadata = signalMetadata(session, envelope.phase, offerHash);
    const senderDevice = offer ? session.callerDevice : session.calleeDevice;
    await verifyDeviceProof(
      parseStoredPublicKey(senderDevice.signingPublicKey, "signing"),
      signalSigningBytes(metadata, envelope.iv, envelope.ciphertext),
      envelope.signature,
    );

    const canonicalEnvelope = JSON.stringify(envelope);
    const existing = await prisma.rtcSignal.findUnique({
      where: {
        sessionId_phase: {
          sessionId,
          phase: offer ? "OFFER" : "ANSWER",
        },
      },
    });
    if (existing) {
      if (existing.envelope !== canonicalEnvelope) {
        throw new P2PHttpError(409, "signal_conflict");
      }
      return p2pJson({ ok: true, duplicate: true });
    }
    if (session.state !== expectedState) {
      throw new P2PHttpError(409, offer ? "offer_conflict" : "claim_required");
    }

    await withSerializableRetry(async (transaction) => {
      if (offer) {
        const transitioned = await transaction.rtcSession.updateMany({
          where: {
            id: session.id,
            state: "CREATED",
            expiresAt: { gt: now },
          },
          data: { state: "OFFERED" },
        });
        if (transitioned.count !== 1) throw new P2PHttpError(409, "offer_conflict");
      } else {
        // Lock and re-check the current session immediately before inserting
        // the answer. Without this guarded no-op update, a concurrent close
        // can delete signals and change the row to CLOSED after the earlier
        // read but before this insert, leaving encrypted SDP retained until
        // expiry. Holding the row lock means close either wins first (0 rows)
        // or runs immediately after this transaction and deletes the answer.
        const claimed = await transaction.rtcSession.updateMany({
          where: {
            id: session.id,
            state: "CLAIMED",
            expiresAt: { gt: now },
          },
          data: { state: "CLAIMED" },
        });
        if (claimed.count !== 1) throw new P2PHttpError(409, "claim_required");
      }
      await transaction.rtcSignal.create({
        data: {
          sessionId: session.id,
          senderDeviceId: senderDevice.id,
          recipientDeviceId: offer ? session.calleeDeviceId : session.callerDeviceId,
          sequence: 0,
          phase: offer ? "OFFER" : "ANSWER",
          envelope: canonicalEnvelope,
          expiresAt: session.expiresAt,
        },
      });
    });

    return p2pJson({ ok: true }, { status: 201 });
  } catch (error) {
    return p2pErrorResponse(error);
  }
}
