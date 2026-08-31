import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SIGNAL_CIPHERTEXT_BYTES,
  P2P_PROTOCOL_VERSION,
  P2PProtocolError,
  base64UrlDecode,
  base64UrlEncode,
  canonicalFields,
  createSessionSigningBytes,
  deviceFingerprint,
  formatSafetyCode,
  importP256AgreementKey,
  normalizeGithubUsername,
  registrationSigningBytes,
  safetyCodeBytes,
  signalAadBytes,
  signalEnvelopeHash,
  signalHkdfSaltBytes,
  signalSigningBytes,
  validateP256PublicJwk,
  validateSignalEnvelope,
  verifyP256Signature,
} from "../src/lib/p2p/protocol.ts";

const encoder = new TextEncoder();
const sessionId = "0f6c218e-4494-4f3d-8e90-22e8cc13d411";
const callerDeviceId = "fb8a4b27-d542-463b-92ba-8a90ee2dce8a";
const calleeDeviceId = "7f493fc9-d8ab-4f3a-bf2d-442c0ca6cc11";

async function keyFixture() {
  const signing = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const agreement = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits", "deriveKey"],
  );
  return {
    signing,
    signingPublicKey: validateP256PublicJwk(
      await crypto.subtle.exportKey("jwk", signing.publicKey),
      "signing",
    ),
    agreementPublicKey: validateP256PublicJwk(
      await crypto.subtle.exportKey("jwk", agreement.publicKey),
      "agreement",
    ),
  };
}

async function sign(privateKey, bytes) {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    bytes,
  );
  return base64UrlEncode(new Uint8Array(signature));
}

test("base64url is unpadded, canonical, and round trips binary data", () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const encoded = base64UrlEncode(bytes);
  assert.equal(encoded, "AAEC-vv8_f7_");
  assert.deepEqual(base64UrlDecode(encoded), bytes);
  assert.throws(() => base64UrlDecode(`${encoded}=`), P2PProtocolError);
  assert.throws(() => base64UrlDecode("a"), P2PProtocolError);
});

test("length-prefixed canonical fields cannot collide through delimiters", () => {
  assert.notDeepEqual(
    canonicalFields("a", "bc"),
    canonicalFields("ab", "c"),
  );
  assert.notDeepEqual(
    canonicalFields("a\u0000b", "c"),
    canonicalFields("a", "b\u0000c"),
  );
});

test("strict P-256 validation accepts generated public keys and rejects private or wrong-use JWKs", async () => {
  const fixture = await keyFixture();
  assert.equal(fixture.signingPublicKey.crv, "P-256");
  assert.deepEqual(fixture.signingPublicKey.key_ops, ["verify"]);
  assert.deepEqual(fixture.agreementPublicKey.key_ops, []);

  assert.throws(
    () => validateP256PublicJwk({ ...fixture.signingPublicKey, d: "secret" }, "signing"),
    P2PProtocolError,
  );
  assert.throws(
    () => validateP256PublicJwk({ ...fixture.signingPublicKey, crv: "P-384" }, "signing"),
    P2PProtocolError,
  );
  assert.throws(
    () => validateP256PublicJwk({ ...fixture.agreementPublicKey, key_ops: ["verify"] }, "agreement"),
    P2PProtocolError,
  );
  const zeroCoordinate = base64UrlEncode(new Uint8Array(32));
  const offCurve = validateP256PublicJwk({
    ...fixture.agreementPublicKey,
    x: zeroCoordinate,
    y: zeroCoordinate,
  }, "agreement");
  await assert.rejects(() => importP256AgreementKey(offCurve));
});

test("registration signatures bind user, both public keys, and issuance time", async () => {
  const fixture = await keyFixture();
  const issuedAt = "2026-08-31T12:34:56.789Z";
  const bytes = registrationSigningBytes({
    userId: "cm123user",
    signingPublicKey: fixture.signingPublicKey,
    agreementPublicKey: fixture.agreementPublicKey,
    issuedAt,
  });
  const signature = await sign(fixture.signing.privateKey, bytes);
  assert.equal(
    await verifyP256Signature(fixture.signingPublicKey, bytes, signature),
    true,
  );
  assert.equal(
    await verifyP256Signature(
      fixture.signingPublicKey,
      registrationSigningBytes({
        userId: "different-user",
        signingPublicKey: fixture.signingPublicKey,
        agreementPublicKey: fixture.agreementPublicKey,
        issuedAt,
      }),
      signature,
    ),
    false,
  );
  assert.notDeepEqual(
    bytes,
    registrationSigningBytes({
      userId: "cm123user",
      signingPublicKey: fixture.signingPublicKey,
      agreementPublicKey: fixture.agreementPublicKey,
      issuedAt,
      replaceExisting: true,
    }),
  );
});

test("session controls normalize GitHub handles before signing", () => {
  assert.equal(normalizeGithubUsername("  Octo-Cat  "), "octo-cat");
  assert.deepEqual(
    createSessionSigningBytes({
      deviceId: callerDeviceId,
      targetUsername: "Octo-Cat",
      requestId: sessionId,
      issuedAt: "2026-08-31T12:34:56.789Z",
    }),
    createSessionSigningBytes({
      deviceId: callerDeviceId,
      targetUsername: "octo-cat",
      requestId: sessionId,
      issuedAt: "2026-08-31T12:34:56.789Z",
    }),
  );
  assert.throws(() => normalizeGithubUsername("octocat@example.com"), P2PProtocolError);
});

test("device fingerprints and pair safety codes are stable and order independent", async () => {
  const first = await keyFixture();
  const second = await keyFixture();
  const firstFingerprint = await deviceFingerprint(first.signingPublicKey, first.agreementPublicKey);
  const secondFingerprint = await deviceFingerprint(second.signingPublicKey, second.agreementPublicKey);
  assert.match(firstFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(
    await deviceFingerprint(first.signingPublicKey, first.agreementPublicKey),
    firstFingerprint,
  );
  const forward = await safetyCodeBytes(firstFingerprint, secondFingerprint);
  const reverse = await safetyCodeBytes(secondFingerprint, firstFingerprint);
  assert.deepEqual(forward, reverse);
  assert.match(formatSafetyCode(forward), /^\d{6}( \d{6}){4}$/);
});

test("signal validation enforces exact phase schema, sizes, UUID, and answer offer binding", async () => {
  const iv = base64UrlEncode(crypto.getRandomValues(new Uint8Array(12)));
  const ciphertext = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  const signature = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  const offer = validateSignalEnvelope({
    version: P2P_PROTOCOL_VERSION,
    sessionId,
    phase: "offer",
    sequence: 0,
    iv,
    ciphertext,
    signature,
  });
  const offerHash = await signalEnvelopeHash(offer);
  assert.equal(base64UrlDecode(offerHash).byteLength, 32);
  assert.equal(validateSignalEnvelope({
    version: 1,
    sessionId,
    phase: "answer",
    sequence: 0,
    iv,
    ciphertext,
    offerHash,
    signature,
  }).offerHash, offerHash);

  assert.throws(() => validateSignalEnvelope({ ...offer, offerHash }), P2PProtocolError);
  assert.throws(() => validateSignalEnvelope({ ...offer, sequence: 1 }), P2PProtocolError);
  assert.throws(() => validateSignalEnvelope({ ...offer, extra: true }), P2PProtocolError);
  assert.throws(() => validateSignalEnvelope({
    ...offer,
    ciphertext: base64UrlEncode(new Uint8Array(MAX_SIGNAL_CIPHERTEXT_BYTES + 1)),
  }), P2PProtocolError);
});

test("signal AAD and signatures bind immutable identities, expiry, phase, and ciphertext", async () => {
  const fixture = await keyFixture();
  const senderFingerprint = await deviceFingerprint(fixture.signingPublicKey, fixture.agreementPublicKey);
  const recipient = await keyFixture();
  const recipientFingerprint = await deviceFingerprint(recipient.signingPublicKey, recipient.agreementPublicKey);
  const metadata = {
    version: P2P_PROTOCOL_VERSION,
    sessionId,
    phase: "offer",
    sequence: 0,
    senderUserId: "caller-user",
    recipientUserId: "callee-user",
    senderDeviceId: callerDeviceId,
    recipientDeviceId: calleeDeviceId,
    senderFingerprint,
    recipientFingerprint,
    expiresAt: "2026-08-31T12:44:56.789Z",
  };
  const iv = base64UrlEncode(crypto.getRandomValues(new Uint8Array(12)));
  const ciphertext = base64UrlEncode(encoder.encode("encrypted-sdp-plus-gcm-tag-placeholder"));
  const signedBytes = signalSigningBytes(metadata, iv, ciphertext);
  const signature = await sign(fixture.signing.privateKey, signedBytes);
  assert.equal(await verifyP256Signature(fixture.signingPublicKey, signedBytes, signature), true);
  assert.equal(
    await verifyP256Signature(
      fixture.signingPublicKey,
      signalSigningBytes({ ...metadata, expiresAt: "2026-08-31T12:45:56.789Z" }, iv, ciphertext),
      signature,
    ),
    false,
  );
  assert.notDeepEqual(signalAadBytes(metadata), signalAadBytes({ ...metadata, phase: "answer" }));
  assert.equal((await signalHkdfSaltBytes(sessionId)).byteLength, 32);
});
