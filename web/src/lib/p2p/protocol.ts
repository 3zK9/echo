export const P2P_PROTOCOL_VERSION = 1 as const;
export const DATA_CHANNEL_LABEL = "echo-text-v1";
export const MAX_SIGNAL_CIPHERTEXT_BYTES = 32 * 1024;
export const MAX_TEXT_CHARACTERS = 2_000;
export const MAX_TEXT_UTF8_BYTES = 4 * 1024;
export const MAX_DATA_FRAME_BYTES = 8 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const GITHUB_USERNAME_PATTERN = /^[a-z\d](?:[a-z\d-]{0,38})$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type ProtocolBytes = Uint8Array<ArrayBuffer>;

export type P256PublicJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  ext: true;
  key_ops: ["verify"] | [];
};

export type SignalPhase = "offer" | "answer";

export type SignalEnvelope = {
  version: typeof P2P_PROTOCOL_VERSION;
  sessionId: string;
  phase: SignalPhase;
  sequence: 0;
  iv: string;
  ciphertext: string;
  offerHash?: string;
  signature: string;
};

export type SignalMetadata = {
  version: typeof P2P_PROTOCOL_VERSION;
  sessionId: string;
  phase: SignalPhase;
  sequence: 0;
  senderUserId: string;
  recipientUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  senderFingerprint: string;
  recipientFingerprint: string;
  expiresAt: string;
  offerHash?: string;
};

export type DeviceIdentity = {
  deviceId: string;
  userId: string;
  username: string;
  signingPublicKey: P256PublicJwk;
  agreementPublicKey: P256PublicJwk;
  fingerprint: string;
};

export type SafetyCodeParticipant = Pick<
  DeviceIdentity,
  "deviceId" | "userId" | "fingerprint"
>;

export class P2PProtocolError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "P2PProtocolError";
  }
}

function assertPlainObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new P2PProtocolError(`${name} must be an object.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  name: string,
) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new P2PProtocolError(`${name} contains unsupported or missing fields.`);
  }
}

function bytesToBinary(bytes: Uint8Array<ArrayBufferLike>): string {
  let output = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return output;
}

export function base64UrlEncode(bytes: Uint8Array<ArrayBufferLike>): string {
  return btoa(bytesToBinary(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): ProtocolBytes {
  if (
    typeof value !== "string" ||
    !value ||
    !BASE64URL_PATTERN.test(value) ||
    value.length % 4 === 1
  ) {
    throw new P2PProtocolError("Invalid base64url value.");
  }

  const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - value.length % 4) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new P2PProtocolError("Invalid base64url value.");
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (base64UrlEncode(bytes) !== value) {
    throw new P2PProtocolError("Non-canonical base64url value.");
  }
  return bytes;
}

export function utf8Bytes(value: string): ProtocolBytes {
  return encoder.encode(value);
}

export function utf8String(value: Uint8Array<ArrayBufferLike>): string {
  try {
    return decoder.decode(value);
  } catch {
    throw new P2PProtocolError("Invalid UTF-8 value.");
  }
}

/**
 * Encode an ordered tuple as a field count followed by unsigned 32-bit,
 * big-endian byte lengths and field bytes. There are no delimiter or JSON
 * canonicalization ambiguities in any signed context.
 */
export function canonicalFields(
  ...fields: readonly (string | Uint8Array<ArrayBufferLike>)[]
): ProtocolBytes {
  const encoded = fields.map((field) => typeof field === "string" ? utf8Bytes(field) : field);
  const totalLength = 4 + encoded.reduce((total, field) => total + 4 + field.byteLength, 0);
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, encoded.length, false);
  let offset = 4;
  for (const field of encoded) {
    view.setUint32(offset, field.byteLength, false);
    offset += 4;
    output.set(field, offset);
    offset += field.byteLength;
  }
  return output;
}

async function sha256(value: Uint8Array<ArrayBufferLike>): Promise<ProtocolBytes> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(value));
  return new Uint8Array(digest);
}

export function normalizeGithubUsername(value: unknown): string {
  if (typeof value !== "string") {
    throw new P2PProtocolError("GitHub username must be a string.");
  }
  const normalized = value.trim().toLowerCase();
  if (!GITHUB_USERNAME_PATTERN.test(normalized)) {
    throw new P2PProtocolError("Invalid GitHub username.");
  }
  return normalized;
}

export function assertUuid(value: unknown, name = "identifier"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new P2PProtocolError(`${name} must be a canonical UUID.`);
  }
  return value;
}

export function assertIsoDate(value: unknown, name = "date"): string {
  if (
    typeof value !== "string" ||
    !ISO_DATE_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new P2PProtocolError(`${name} must be a canonical ISO timestamp.`);
  }
  return value;
}

function assertCoordinate(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new P2PProtocolError(`${name} must be base64url.`);
  }
  const bytes = base64UrlDecode(value);
  if (bytes.byteLength !== 32) {
    throw new P2PProtocolError(`${name} must contain exactly 32 bytes.`);
  }
  return value;
}

export function validateP256PublicJwk(
  input: unknown,
  usage: "signing" | "agreement",
): P256PublicJwk {
  assertPlainObject(input, `${usage} public key`);
  assertExactKeys(input, ["crv", "ext", "key_ops", "kty", "x", "y"], `${usage} public key`);
  if (input.kty !== "EC" || input.crv !== "P-256" || input.ext !== true) {
    throw new P2PProtocolError(`${usage} public key must be an extractable P-256 EC public key.`);
  }
  if (!Array.isArray(input.key_ops)) {
    throw new P2PProtocolError(`${usage} public key has invalid operations.`);
  }
  const expectedOperations = usage === "signing" ? ["verify"] : [];
  if (
    input.key_ops.length !== expectedOperations.length ||
    input.key_ops.some((operation, index) => operation !== expectedOperations[index])
  ) {
    throw new P2PProtocolError(`${usage} public key has invalid operations.`);
  }

  return {
    kty: "EC",
    crv: "P-256",
    x: assertCoordinate(input.x, `${usage} key x`),
    y: assertCoordinate(input.y, `${usage} key y`),
    ext: true,
    key_ops: usage === "signing" ? ["verify"] : [],
  };
}

export function canonicalPublicJwk(jwk: P256PublicJwk): string {
  return JSON.stringify({
    crv: jwk.crv,
    ext: jwk.ext,
    key_ops: jwk.key_ops,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
}

export async function deviceFingerprint(
  signingPublicKey: P256PublicJwk,
  agreementPublicKey: P256PublicJwk,
): Promise<string> {
  const digest = await sha256(canonicalFields(
    "echo-p2p-device-fingerprint-v1",
    canonicalPublicJwk(signingPublicKey),
    canonicalPublicJwk(agreementPublicKey),
  ));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safetyCodeParticipantBinding(participant: SafetyCodeParticipant): string {
  if (
    typeof participant.userId !== "string" ||
    participant.userId.length === 0 ||
    participant.userId.length > 128 ||
    !FINGERPRINT_PATTERN.test(participant.fingerprint)
  ) {
    throw new P2PProtocolError("Invalid safety-code participant.");
  }
  return JSON.stringify({
    deviceId: assertUuid(participant.deviceId, "deviceId"),
    fingerprint: participant.fingerprint,
    userId: participant.userId,
  });
}

/**
 * A short-authentication string for a precise pair of Echo identities. Binding
 * both account and device identifiers prevents an unknown-key-share display in
 * which an otherwise valid device key is relabelled as a different account.
 */
export async function safetyCodeBytes(
  first: SafetyCodeParticipant,
  second: SafetyCodeParticipant,
): Promise<ProtocolBytes> {
  const ordered = [
    safetyCodeParticipantBinding(first),
    safetyCodeParticipantBinding(second),
  ].sort();
  return sha256(canonicalFields("echo-p2p-safety-code-v2", ordered[0], ordered[1]));
}

export function formatSafetyCode(bytes: Uint8Array<ArrayBufferLike>): string {
  if (bytes.byteLength < 15) {
    throw new P2PProtocolError("Safety-code input is too short.");
  }
  const groups: string[] = [];
  for (let offset = 0; offset < 15; offset += 3) {
    const value = ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) % 1_000_000;
    groups.push(value.toString().padStart(6, "0"));
  }
  return groups.join(" ");
}

export function registrationSigningBytes(input: {
  userId: string;
  signingPublicKey: P256PublicJwk;
  agreementPublicKey: P256PublicJwk;
  issuedAt: string;
  replaceExisting?: boolean;
}): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-register-v1",
    input.userId,
    canonicalPublicJwk(input.signingPublicKey),
    canonicalPublicJwk(input.agreementPublicKey),
    input.issuedAt,
    input.replaceExisting === true ? "replace" : "register",
  );
}

export function presenceSigningBytes(input: {
  deviceId: string;
  issuedAt: string;
}): ProtocolBytes {
  return canonicalFields("echo-p2p-presence-v1", input.deviceId, input.issuedAt);
}

export function inboxSigningBytes(input: {
  deviceId: string;
  requestId: string;
  issuedAt: string;
}): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-read-inbox-v1",
    input.deviceId,
    input.requestId,
    input.issuedAt,
  );
}

export function createSessionSigningBytes(input: {
  deviceId: string;
  targetUsername: string;
  requestId: string;
  issuedAt: string;
}): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-create-session-v1",
    input.deviceId,
    normalizeGithubUsername(input.targetUsername),
    input.requestId,
    input.issuedAt,
  );
}

export function claimSessionSigningBytes(input: {
  deviceId: string;
  sessionId: string;
  requestId: string;
  issuedAt: string;
}): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-claim-session-v1",
    input.deviceId,
    input.sessionId,
    input.requestId,
    input.issuedAt,
  );
}

export function closeSessionSigningBytes(input: {
  deviceId: string;
  sessionId: string;
  requestId: string;
  issuedAt: string;
}): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-close-session-v1",
    input.deviceId,
    input.sessionId,
    input.requestId,
    input.issuedAt,
  );
}

export function signalKeyInfoBytes(metadata: SignalMetadata): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-signal-key-v1",
    String(metadata.version),
    metadata.sessionId,
    metadata.senderUserId,
    metadata.recipientUserId,
    metadata.senderDeviceId,
    metadata.recipientDeviceId,
    metadata.senderFingerprint,
    metadata.recipientFingerprint,
    metadata.phase,
  );
}

export async function signalHkdfSaltBytes(sessionId: string): Promise<ProtocolBytes> {
  assertUuid(sessionId, "sessionId");
  return sha256(utf8Bytes(sessionId));
}

export function signalAadBytes(metadata: SignalMetadata): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-signal-aad-v1",
    String(metadata.version),
    metadata.sessionId,
    metadata.senderUserId,
    metadata.recipientUserId,
    metadata.senderDeviceId,
    metadata.recipientDeviceId,
    metadata.senderFingerprint,
    metadata.recipientFingerprint,
    metadata.phase,
    String(metadata.sequence),
    metadata.expiresAt,
    metadata.offerHash ?? "",
  );
}

export function signalSigningBytes(
  metadata: SignalMetadata,
  iv: string,
  ciphertext: string,
): ProtocolBytes {
  return canonicalFields(
    "echo-p2p-signal-signature-v1",
    signalAadBytes(metadata),
    base64UrlDecode(iv),
    base64UrlDecode(ciphertext),
  );
}

export function validateSignalEnvelope(input: unknown): SignalEnvelope {
  assertPlainObject(input, "signal envelope");
  const phase = input.phase;
  if (phase !== "offer" && phase !== "answer") {
    throw new P2PProtocolError("Signal phase must be offer or answer.");
  }
  const expectedKeys = phase === "answer"
    ? ["ciphertext", "iv", "offerHash", "phase", "sequence", "sessionId", "signature", "version"]
    : ["ciphertext", "iv", "phase", "sequence", "sessionId", "signature", "version"];
  assertExactKeys(input, expectedKeys, "signal envelope");
  if (input.version !== P2P_PROTOCOL_VERSION || input.sequence !== 0) {
    throw new P2PProtocolError("Unsupported signal version or sequence.");
  }

  const iv = typeof input.iv === "string" ? input.iv : "";
  const ciphertext = typeof input.ciphertext === "string" ? input.ciphertext : "";
  const signature = typeof input.signature === "string" ? input.signature : "";
  if (base64UrlDecode(iv).byteLength !== 12) {
    throw new P2PProtocolError("Signal IV must contain exactly 12 bytes.");
  }
  const ciphertextLength = base64UrlDecode(ciphertext).byteLength;
  if (ciphertextLength < 16 || ciphertextLength > MAX_SIGNAL_CIPHERTEXT_BYTES) {
    throw new P2PProtocolError("Signal ciphertext has an unsupported size.");
  }
  if (base64UrlDecode(signature).byteLength !== 64) {
    throw new P2PProtocolError("Signal signature must contain exactly 64 bytes.");
  }

  let offerHash: string | undefined;
  if (phase === "answer") {
    offerHash = typeof input.offerHash === "string" ? input.offerHash : "";
    if (base64UrlDecode(offerHash).byteLength !== 32) {
      throw new P2PProtocolError("Answer must bind a 32-byte offer hash.");
    }
  }

  return {
    version: P2P_PROTOCOL_VERSION,
    sessionId: assertUuid(input.sessionId, "sessionId"),
    phase,
    sequence: 0,
    iv,
    ciphertext,
    ...(offerHash ? { offerHash } : {}),
    signature,
  };
}

export async function signalEnvelopeHash(envelope: SignalEnvelope): Promise<string> {
  const normalized = validateSignalEnvelope(envelope);
  if (normalized.phase !== "offer") {
    throw new P2PProtocolError("Only offers can be bound to an answer.");
  }
  // The offer is independently authenticated by its ECDSA signature. Do not
  // include the raw signature in this binding: ECDSA permits mathematically
  // equivalent high-S encodings, which could otherwise turn a harmless
  // signature normalization into an answer-binding denial of service.
  return base64UrlEncode(await sha256(canonicalFields(
    "echo-p2p-offer-binding-v2",
    String(normalized.version),
    normalized.sessionId,
    normalized.phase,
    String(normalized.sequence),
    normalized.iv,
    normalized.ciphertext,
  )));
}

export async function importP256VerifyKey(jwk: P256PublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

export async function importP256AgreementKey(jwk: P256PublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

export async function verifyP256Signature(
  jwk: P256PublicJwk,
  signedBytes: Uint8Array<ArrayBufferLike>,
  signature: string,
): Promise<boolean> {
  const signatureBytes = base64UrlDecode(signature);
  if (signatureBytes.byteLength !== 64) return false;
  const key = await importP256VerifyKey(jwk);
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signatureBytes,
    new Uint8Array(signedBytes),
  );
}
