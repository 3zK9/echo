"use client";

import {
  P2P_PROTOCOL_VERSION,
  signalAadBytes,
  signalEnvelopeHash,
  signalHkdfSaltBytes,
  signalKeyInfoBytes,
  signalSigningBytes,
  validateSignalEnvelope,
  verifyP256Signature,
  type SignalEnvelope,
  type SignalMetadata,
  type SignalPhase,
} from "@/lib/p2p/protocol";
import {
  decryptSignalPayload,
  deriveSignalKey,
  encryptSignalPayload,
  signBytes,
  type BrowserIdentity,
  type ClientSession,
} from "@/lib/p2p/browser";
import {
  assertPrivacyPreservingRemoteSdp,
  redactNumericHostCandidates,
} from "@/lib/p2p/sdp";

export type EncryptedSessionDescription = {
  v: 1;
  type: "offer" | "answer";
  sdp: string;
};

function signalMetadata(
  session: ClientSession,
  phase: SignalPhase,
  outbound: boolean,
  offerHash?: string,
): SignalMetadata {
  const sender = outbound ? session.self : session.peer;
  const recipient = outbound ? session.peer : session.self;
  return {
    version: P2P_PROTOCOL_VERSION,
    sessionId: session.id,
    phase,
    sequence: 0,
    senderUserId: sender.userId,
    recipientUserId: recipient.userId,
    senderDeviceId: sender.deviceId,
    recipientDeviceId: recipient.deviceId,
    senderFingerprint: sender.fingerprint,
    recipientFingerprint: recipient.fingerprint,
    expiresAt: session.expiresAt,
    ...(offerHash ? { offerHash } : {}),
  };
}

function normalizedDescription(
  value: RTCSessionDescriptionInit,
  phase: SignalPhase,
): EncryptedSessionDescription {
  if (value.type !== phase || typeof value.sdp !== "string") {
    throw new TypeError("invalid_session_description");
  }
  return {
    v: P2P_PROTOCOL_VERSION,
    type: phase,
    // Keep this defensive boundary here as well as in ICE gathering: no
    // caller of the generic sealing helper can accidentally relay a numeric
    // host or related address.
    sdp: redactNumericHostCandidates(value.sdp),
  };
}

function validateDescription(value: unknown, phase: SignalPhase): EncryptedSessionDescription {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("invalid_session_description");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "sdp,type,v" ||
      record.v !== P2P_PROTOCOL_VERSION ||
      record.type !== phase ||
      typeof record.sdp !== "string") {
    throw new TypeError("invalid_session_description");
  }
  return {
    v: P2P_PROTOCOL_VERSION,
    type: phase,
    // Do not sanitize a peer's signed payload. Reject it before callers can
    // hand it to RTCPeerConnection.setRemoteDescription.
    sdp: assertPrivacyPreservingRemoteSdp(record.sdp),
  };
}

export async function sealSessionDescription(
  identity: BrowserIdentity,
  session: ClientSession,
  phase: SignalPhase,
  description: RTCSessionDescriptionInit,
  offerHash?: string,
): Promise<SignalEnvelope> {
  if (identity.userId !== session.self.userId || identity.deviceId !== session.self.deviceId) {
    throw new TypeError("local_identity_mismatch");
  }
  if ((phase === "offer" && offerHash) || (phase === "answer" && !offerHash)) {
    throw new TypeError("invalid_offer_binding");
  }
  const metadata = signalMetadata(session, phase, true, offerHash);
  const [salt, info] = await Promise.all([
    signalHkdfSaltBytes(session.id),
    Promise.resolve(signalKeyInfoBytes(metadata)),
  ]);
  const key = await deriveSignalKey(identity, session.peer.agreementPublicKey, salt, info);
  const encrypted = await encryptSignalPayload(
    key,
    normalizedDescription(description, phase),
    signalAadBytes(metadata),
  );
  const signature = await signBytes(
    identity,
    signalSigningBytes(metadata, encrypted.iv, encrypted.ciphertext),
  );
  return validateSignalEnvelope({
    version: P2P_PROTOCOL_VERSION,
    sessionId: session.id,
    phase,
    sequence: 0,
    ...encrypted,
    ...(offerHash ? { offerHash } : {}),
    signature,
  });
}

export async function openSessionDescription(
  identity: BrowserIdentity,
  session: ClientSession,
  envelopeValue: unknown,
  phase: SignalPhase,
  expectedOfferHash?: string,
): Promise<EncryptedSessionDescription> {
  const envelope = validateSignalEnvelope(envelopeValue);
  if (identity.userId !== session.self.userId || identity.deviceId !== session.self.deviceId ||
      envelope.sessionId !== session.id || envelope.phase !== phase ||
      (phase === "offer" && envelope.offerHash !== undefined) ||
      (phase === "answer" && envelope.offerHash !== expectedOfferHash)) {
    throw new TypeError("signal_context_mismatch");
  }
  const metadata = signalMetadata(session, phase, false, envelope.offerHash);
  const verified = await verifyP256Signature(
    session.peer.signingPublicKey,
    signalSigningBytes(metadata, envelope.iv, envelope.ciphertext),
    envelope.signature,
  );
  if (!verified) throw new TypeError("invalid_signal_signature");

  const [salt, info] = await Promise.all([
    signalHkdfSaltBytes(session.id),
    Promise.resolve(signalKeyInfoBytes(metadata)),
  ]);
  const key = await deriveSignalKey(identity, session.peer.agreementPublicKey, salt, info);
  const decrypted = await decryptSignalPayload<unknown>(
    key,
    envelope.iv,
    envelope.ciphertext,
    signalAadBytes(metadata),
  );
  return validateDescription(decrypted, phase);
}

export { signalEnvelopeHash };
