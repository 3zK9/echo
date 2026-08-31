"use client";

import {
  assertIsoDate,
  assertUuid,
  claimSessionSigningBytes,
  closeSessionSigningBytes,
  createSessionSigningBytes,
  DATA_CHANNEL_LABEL,
  deviceFingerprint,
  presenceSigningBytes,
  registrationSigningBytes,
  validateP256PublicJwk,
  validateSignalEnvelope,
  type DeviceIdentity,
  type P256PublicJwk,
  type ProtocolBytes,
  type SignalEnvelope,
} from "./protocol";
import {
  serializeTextFrame,
  type TextFrame,
} from "./frames";

export {
  createTextFrame,
  normalizeOutgoingText,
  parseTextFrame,
  serializeTextFrame,
  validateMessageText,
  type TextFrame,
} from "./frames";

const DATABASE_NAME = "echo-live-messaging-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "p2p";
const IDENTITY_PREFIX = "identity:";
const PIN_PREFIX = "pin:";
const MAX_BUFFERED_BYTES = 64 * 1024;
const LOW_BUFFERED_BYTES = 16 * 1024;
const ICE_GATHER_TIMEOUT_MS = 10_000;

export const P2P_STUN_URL = "stun:stun.cloudflare.com:3478";

export class BrowserP2PError extends Error {
  readonly code:
    | "unsupported_browser"
    | "identity_storage_failed"
    | "invalid_identity"
    | "invalid_peer_key"
    | "invalid_message"
    | "message_too_large"
    | "channel_unavailable"
    | "channel_backpressure"
    | "ice_gather_failed"
    | "signal_decryption_failed";

  constructor(
    code:
      | "unsupported_browser"
      | "identity_storage_failed"
      | "invalid_identity"
      | "invalid_peer_key"
      | "invalid_message"
      | "message_too_large"
      | "channel_unavailable"
      | "channel_backpressure"
      | "ice_gather_failed"
      | "signal_decryption_failed",
    message: string,
  ) {
    super(message);
    this.name = "BrowserP2PError";
    this.code = code;
  }
}

export type BrowserIdentity = {
  userId: string;
  deviceId?: string;
  signingPrivateKey: CryptoKey;
  signingPublicKey: CryptoKey;
  signingPublicJwk: P256PublicJwk;
  agreementPrivateKey: CryptoKey;
  agreementPublicKey: CryptoKey;
  agreementPublicJwk: P256PublicJwk;
};

type StoredIdentity = BrowserIdentity & {
  key: string;
  kind: "identity";
  createdAt: string;
};

export type PeerPin = {
  key: string;
  kind: "pin";
  userId: string;
  deviceId: string;
  fingerprint: string;
  trustedAt: string;
};

export type PinStatus =
  | { status: "new"; pin: null }
  | { status: "trusted"; pin: PeerPin }
  | { status: "changed"; pin: PeerPin };

export type ClientSession = {
  id: string;
  role: "caller" | "callee";
  expiresAt: string;
  self: DeviceIdentity;
  peer: DeviceIdentity;
};

export type InboxItem = {
  session: ClientSession;
  signal: SignalEnvelope;
};

export type PreparedCloseRequest = {
  sessionId: string;
  path: string;
  body: string;
};

export class P2PApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message = code,
  ) {
    super(message);
    this.name = "P2PApiError";
    this.status = status;
    this.code = code;
  }
}


function requireBrowserCrypto() {
  if (
    typeof window === "undefined" ||
    !window.indexedDB ||
    !navigator.locks ||
    !globalThis.crypto?.subtle ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new BrowserP2PError(
      "unsupported_browser",
      "This browser cannot create a durable, non-exportable messaging identity.",
    );
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexed_db_request_failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("indexed_db_transaction_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("indexed_db_transaction_aborted"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  requireBrowserCrypto();
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "key" });
    }
  };
  return requestResult(request);
}

async function getStoredValue<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completed = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    await completed;
    return value as T | undefined;
  } finally {
    database.close();
  }
}

async function putStoredValue(value: StoredIdentity | PeerPin): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(value);
    await completed;
  } finally {
    database.close();
  }
}

function isP256PublicJwk(value: unknown): value is P256PublicJwk {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const key = value as Record<string, unknown>;
  return key.kty === "EC" &&
    key.crv === "P-256" &&
    typeof key.x === "string" &&
    typeof key.y === "string" &&
    key.x.length === 43 &&
    key.y.length === 43;
}

function isPrivateIdentityKey(key: unknown, algorithm: "ECDSA" | "ECDH", usage: KeyUsage): key is CryptoKey {
  if (!(key instanceof CryptoKey)) return false;
  const namedCurve = (key.algorithm as EcKeyAlgorithm).namedCurve;
  return key.type === "private" &&
    key.extractable === false &&
    key.algorithm.name === algorithm &&
    namedCurve === "P-256" &&
    key.usages.includes(usage);
}

function isPublicIdentityKey(key: unknown, algorithm: "ECDSA" | "ECDH", usage?: KeyUsage): key is CryptoKey {
  if (!(key instanceof CryptoKey)) return false;
  const namedCurve = (key.algorithm as EcKeyAlgorithm).namedCurve;
  return key.type === "public" &&
    key.algorithm.name === algorithm &&
    namedCurve === "P-256" &&
    (usage ? key.usages.includes(usage) : key.usages.length === 0);
}

function validateStoredIdentity(value: unknown, userId: string): value is StoredIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<StoredIdentity>;
  return identity.key === `${IDENTITY_PREFIX}${userId}` &&
    identity.kind === "identity" &&
    identity.userId === userId &&
    (identity.deviceId === undefined || typeof identity.deviceId === "string") &&
    isPrivateIdentityKey(identity.signingPrivateKey, "ECDSA", "sign") &&
    isPublicIdentityKey(identity.signingPublicKey, "ECDSA", "verify") &&
    isP256PublicJwk(identity.signingPublicJwk) &&
    isPrivateIdentityKey(identity.agreementPrivateKey, "ECDH", "deriveBits") &&
    isPublicIdentityKey(identity.agreementPublicKey, "ECDH") &&
    isP256PublicJwk(identity.agreementPublicJwk);
}

async function generateIdentity(userId: string): Promise<StoredIdentity> {
  const [signingKeys, agreementKeys] = await Promise.all([
    crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    ) as Promise<CryptoKeyPair>,
    crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    ) as Promise<CryptoKeyPair>,
  ]);

  const [signingPublicJwk, agreementPublicJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", signingKeys.publicKey),
    crypto.subtle.exportKey("jwk", agreementKeys.publicKey),
  ]);

  if (!isP256PublicJwk(signingPublicJwk) || !isP256PublicJwk(agreementPublicJwk)) {
    throw new BrowserP2PError("invalid_identity", "The browser generated an unsupported identity key.");
  }

  return {
    key: `${IDENTITY_PREFIX}${userId}`,
    kind: "identity",
    userId,
    signingPrivateKey: signingKeys.privateKey,
    signingPublicKey: signingKeys.publicKey,
    signingPublicJwk,
    agreementPrivateKey: agreementKeys.privateKey,
    agreementPublicKey: agreementKeys.publicKey,
    agreementPublicJwk,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Return the origin-scoped browser identity for this Echo user. Private keys
 * are structured-cloned into IndexedDB as non-extractable CryptoKeys; their
 * private material is never serialized into application data.
 */
export async function getOrCreateBrowserIdentity(userId: string): Promise<BrowserIdentity> {
  requireBrowserCrypto();
  const storageKey = `${IDENTITY_PREFIX}${userId}`;

  try {
    return await navigator.locks.request(`echo-p2p-identity:${userId}`, { mode: "exclusive" }, async () => {
      const existing = await getStoredValue<StoredIdentity>(storageKey);
      if (existing) {
        if (!validateStoredIdentity(existing, userId)) {
          throw new BrowserP2PError("invalid_identity", "The saved messaging identity is invalid.");
        }
        return existing;
      }

      const generated = await generateIdentity(userId);
      await putStoredValue(generated);
      const persisted = await getStoredValue<StoredIdentity>(storageKey);
      if (!validateStoredIdentity(persisted, userId)) {
        throw new BrowserP2PError(
          "identity_storage_failed",
          "The browser could not persist a non-exportable messaging identity.",
        );
      }
      return persisted;
    });
  } catch (error) {
    if (error instanceof BrowserP2PError) throw error;
    throw new BrowserP2PError(
      "identity_storage_failed",
      "The browser could not securely store its messaging identity.",
    );
  }
}

export async function saveServerDeviceId(identity: BrowserIdentity, deviceId: string): Promise<BrowserIdentity> {
  if (!deviceId) throw new BrowserP2PError("invalid_identity", "The server returned an invalid device id.");
  const value: StoredIdentity = {
    ...identity,
    key: `${IDENTITY_PREFIX}${identity.userId}`,
    kind: "identity",
    deviceId,
    createdAt: new Date().toISOString(),
  };
  await putStoredValue(value);
  return value;
}

export async function signBytes(identity: BrowserIdentity, bytes: ProtocolBytes): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    identity.signingPrivateKey,
    bytes,
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyBytes(
  publicKey: P256PublicJwk,
  bytes: ProtocolBytes,
  signature: string,
): Promise<boolean> {
  try {
    const imported = await crypto.subtle.importKey(
      "jwk",
      publicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      imported,
      base64UrlToBytes(signature),
      bytes,
    );
  } catch {
    return false;
  }
}

export async function deriveSignalKey(
  identity: BrowserIdentity,
  peerAgreementPublicKey: P256PublicJwk,
  salt: ProtocolBytes,
  info: ProtocolBytes,
): Promise<CryptoKey> {
  let peerKey: CryptoKey;
  try {
    peerKey = await crypto.subtle.importKey(
      "jwk",
      peerAgreementPublicKey,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
  } catch {
    throw new BrowserP2PError("invalid_peer_key", "The peer supplied an invalid agreement key.");
  }

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    identity.agreementPrivateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSignalPayload(
  key: CryptoKey,
  payload: unknown,
  additionalData: ProtocolBytes,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData, tagLength: 128 },
    key,
    plaintext,
  );
  return {
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptSignalPayload<T>(
  key: CryptoKey,
  iv: string,
  ciphertext: string,
  additionalData: ProtocolBytes,
): Promise<T> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(iv),
        additionalData,
        tagLength: 128,
      },
      key,
      base64UrlToBytes(ciphertext),
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as T;
  } catch {
    throw new BrowserP2PError(
      "signal_decryption_failed",
      "The encrypted connection details could not be authenticated.",
    );
  }
}

export async function getPeerPin(userId: string): Promise<PeerPin | null> {
  const value = await getStoredValue<PeerPin>(`${PIN_PREFIX}${userId}`);
  if (!value || value.kind !== "pin" || value.userId !== userId) return null;
  return value;
}

export async function peerPinStatus(
  userId: string,
  deviceId: string,
  fingerprint: string,
): Promise<PinStatus> {
  const pin = await getPeerPin(userId);
  if (!pin) return { status: "new", pin: null };
  if (pin.deviceId === deviceId && pin.fingerprint === fingerprint) {
    return { status: "trusted", pin };
  }
  return { status: "changed", pin };
}

export async function trustPeer(
  userId: string,
  deviceId: string,
  fingerprint: string,
): Promise<PeerPin> {
  const pin: PeerPin = {
    key: `${PIN_PREFIX}${userId}`,
    kind: "pin",
    userId,
    deviceId,
    fingerprint,
    trustedAt: new Date().toISOString(),
  };
  await putStoredValue(pin);
  return pin;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (response.ok && response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    if (!response.ok) throw new P2PApiError(response.status, "request_failed");
    throw new P2PApiError(502, "invalid_server_response");
  }
  const body = await response.json();
  if (!response.ok) {
    const code = isPlainRecord(body) && typeof body.error === "string" ? body.error : "request_failed";
    throw new P2PApiError(response.status, code);
  }
  return body;
}

async function apiRequest(
  path: string,
  init: RequestInit,
  abortSignal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: abortSignal,
  });
  return readJsonResponse(response);
}

async function validateDeviceIdentity(value: unknown): Promise<DeviceIdentity> {
  if (!isPlainRecord(value)) throw new P2PApiError(502, "invalid_server_response");
  const deviceId = assertUuid(value.deviceId, "deviceId");
  const userId = typeof value.userId === "string" && value.userId ? value.userId : "";
  const username = typeof value.username === "string" && value.username ? value.username : "";
  const fingerprint = typeof value.fingerprint === "string" ? value.fingerprint : "";
  if (!userId || !username || !/^[0-9a-f]{64}$/u.test(fingerprint)) {
    throw new P2PApiError(502, "invalid_server_response");
  }
  const signingPublicKey = validateP256PublicJwk(value.signingPublicKey, "signing");
  const agreementPublicKey = validateP256PublicJwk(value.agreementPublicKey, "agreement");
  const expectedFingerprint = await deviceFingerprint(signingPublicKey, agreementPublicKey);
  if (expectedFingerprint !== fingerprint) {
    throw new P2PApiError(502, "invalid_device_fingerprint");
  }
  return {
    deviceId,
    userId,
    username,
    signingPublicKey,
    agreementPublicKey,
    fingerprint,
  };
}

async function validateClientSession(value: unknown): Promise<ClientSession> {
  if (!isPlainRecord(value)) throw new P2PApiError(502, "invalid_server_response");
  if (value.role !== "caller" && value.role !== "callee") {
    throw new P2PApiError(502, "invalid_server_response");
  }
  return {
    id: assertUuid(value.id, "sessionId"),
    role: value.role,
    expiresAt: assertIsoDate(value.expiresAt, "expiresAt"),
    self: await validateDeviceIdentity(value.self),
    peer: await validateDeviceIdentity(value.peer),
  };
}

export type DeviceRegistrationOptions = {
  abortSignal?: AbortSignal;
  // A browser must never silently rotate a registered messaging identity.
  // The UI exposes this only after a user has explicitly acknowledged it.
  replaceExisting?: boolean;
};

export async function registerBrowserDevice(
  identity: BrowserIdentity,
  options: DeviceRegistrationOptions = {},
): Promise<{ identity: BrowserIdentity; device: DeviceIdentity; replaced: boolean }> {
  const issuedAt = new Date().toISOString();
  const signed = {
    userId: identity.userId,
    signingPublicKey: identity.signingPublicJwk,
    agreementPublicKey: identity.agreementPublicJwk,
    issuedAt,
    ...(options.replaceExisting ? { replaceExisting: true } : {}),
  };
  const signature = await signBytes(identity, registrationSigningBytes(signed));
  const result = await apiRequest("/api/p2p/device", {
    method: "PUT",
    body: JSON.stringify({
      ...signed,
      ...(identity.deviceId ? { deviceId: identity.deviceId } : {}),
      signature,
    }),
  }, options.abortSignal);
  if (!isPlainRecord(result)) throw new P2PApiError(502, "invalid_server_response");
  const device = await validateDeviceIdentity(result.device);
  const localFingerprint = await deviceFingerprint(identity.signingPublicJwk, identity.agreementPublicJwk);
  if (device.userId !== identity.userId || device.fingerprint !== localFingerprint) {
    throw new P2PApiError(502, "device_registration_mismatch");
  }
  const updatedIdentity = identity.deviceId === device.deviceId
    ? identity
    : await saveServerDeviceId(identity, device.deviceId);
  return { identity: updatedIdentity, device, replaced: result.replaced === true };
}

export async function prepareBrowserDevice(
  userId: string,
  options: DeviceRegistrationOptions = {},
): Promise<{ identity: BrowserIdentity; device: DeviceIdentity; replaced: boolean }> {
  requireBrowserCrypto();
  return navigator.locks.request(
    `echo-p2p-registration:${userId}`,
    { mode: "exclusive", ...(options.abortSignal ? { signal: options.abortSignal } : {}) },
    async () => {
    const identity = await getOrCreateBrowserIdentity(userId);
    if (options.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");
    return registerBrowserDevice(identity, options);
    },
  );
}

export async function publishPresence(
  identity: BrowserIdentity,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (!identity.deviceId) throw new BrowserP2PError("invalid_identity", "The messaging device is not registered.");
  const input = { deviceId: identity.deviceId, issuedAt: new Date().toISOString() };
  const signature = await signBytes(identity, presenceSigningBytes(input));
  const result = await apiRequest("/api/p2p/presence", {
    method: "POST",
    body: JSON.stringify({ ...input, signature }),
  }, abortSignal);
  if (!isPlainRecord(result)) throw new P2PApiError(502, "invalid_server_response");
  return assertIsoDate(result.onlineUntil, "onlineUntil");
}

export async function createLiveSession(
  identity: BrowserIdentity,
  targetUsername: string,
  abortSignal?: AbortSignal,
): Promise<ClientSession> {
  if (!identity.deviceId) throw new BrowserP2PError("invalid_identity", "The messaging device is not registered.");
  const input = {
    deviceId: identity.deviceId,
    targetUsername,
    requestId: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
  };
  const signature = await signBytes(identity, createSessionSigningBytes(input));
  const result = await apiRequest("/api/p2p/sessions", {
    method: "POST",
    body: JSON.stringify({ ...input, signature }),
  }, abortSignal);
  if (!isPlainRecord(result)) throw new P2PApiError(502, "invalid_server_response");
  return validateClientSession(result.session);
}

export async function readInbox(
  identity: BrowserIdentity,
  abortSignal?: AbortSignal,
): Promise<InboxItem[]> {
  if (!identity.deviceId) throw new BrowserP2PError("invalid_identity", "The messaging device is not registered.");
  const result = await apiRequest(
    `/api/p2p/inbox?deviceId=${encodeURIComponent(identity.deviceId)}`,
    { method: "GET" },
    abortSignal,
  );
  if (!isPlainRecord(result) || !Array.isArray(result.items)) {
    throw new P2PApiError(502, "invalid_server_response");
  }
  return Promise.all(result.items.map(async (value) => {
    if (!isPlainRecord(value)) throw new P2PApiError(502, "invalid_server_response");
    return {
      session: await validateClientSession(value.session),
      signal: validateSignalEnvelope(value.signal),
    };
  }));
}

export async function claimLiveSession(
  identity: BrowserIdentity,
  sessionId: string,
  abortSignal?: AbortSignal,
): Promise<ClientSession> {
  if (!identity.deviceId) throw new BrowserP2PError("invalid_identity", "The messaging device is not registered.");
  const input = {
    deviceId: identity.deviceId,
    sessionId,
    requestId: claimRequestId(sessionId),
    issuedAt: new Date().toISOString(),
  };
  const signature = await signBytes(identity, claimSessionSigningBytes(input));
  const result = await apiRequest(`/api/p2p/sessions/${encodeURIComponent(sessionId)}/claim`, {
    method: "POST",
    body: JSON.stringify({
      deviceId: input.deviceId,
      requestId: input.requestId,
      issuedAt: input.issuedAt,
      signature,
    }),
  }, abortSignal);
  if (!isPlainRecord(result)) throw new P2PApiError(502, "invalid_server_response");
  return validateClientSession(result.session);
}

export async function postSignalEnvelope(
  sessionId: string,
  envelope: SignalEnvelope,
  abortSignal?: AbortSignal,
): Promise<void> {
  const result = await apiRequest(`/api/p2p/sessions/${encodeURIComponent(sessionId)}/signal`, {
    method: "POST",
    body: JSON.stringify({ envelope }),
  }, abortSignal);
  if (isPlainRecord(result) && result.ok === false) {
    throw new P2PApiError(502, "signal_rejected");
  }
}

export async function closeLiveSession(
  identity: BrowserIdentity,
  sessionId: string,
  options: { abortSignal?: AbortSignal; keepalive?: boolean } = {},
): Promise<void> {
  if (!identity.deviceId) return;
  const prepared = await prepareCloseLiveSession(identity, sessionId);
  await sendPreparedCloseLiveSession(prepared, options);
}

export async function prepareCloseLiveSession(
  identity: BrowserIdentity,
  sessionId: string,
): Promise<PreparedCloseRequest> {
  if (!identity.deviceId) {
    throw new BrowserP2PError("invalid_identity", "The messaging device is not registered.");
  }
  const input = {
    deviceId: identity.deviceId,
    sessionId,
    requestId: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
  };
  const signature = await signBytes(identity, closeSessionSigningBytes(input));
  return {
    sessionId,
    path: `/api/p2p/sessions/${encodeURIComponent(sessionId)}`,
    body: JSON.stringify({
      deviceId: input.deviceId,
      requestId: input.requestId,
      issuedAt: input.issuedAt,
      signature,
    }),
  };
}

export async function sendPreparedCloseLiveSession(
  prepared: PreparedCloseRequest,
  options: { abortSignal?: AbortSignal; keepalive?: boolean } = {},
): Promise<void> {
  await apiRequest(prepared.path, {
    method: "DELETE",
    keepalive: options.keepalive,
    body: prepared.body,
  }, options.abortSignal);
  forgetClaimRequestId(prepared.sessionId);
}

const CLAIM_REQUEST_STORAGE_KEY = "echo-p2p-claim-requests-v1";

function claimRequestId(sessionId: string): string {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(CLAIM_REQUEST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, { requestId?: unknown; expiresAt?: unknown }> : {};
    const active: Record<string, { requestId: string; expiresAt: number }> = {};
    for (const [storedSessionId, value] of Object.entries(parsed)) {
      if (typeof value?.requestId !== "string" || typeof value?.expiresAt !== "number" || value.expiresAt <= now) continue;
      try {
        active[assertUuid(storedSessionId, "sessionId")] = {
          requestId: assertUuid(value.requestId, "requestId"),
          expiresAt: value.expiresAt,
        };
      } catch {}
    }
    if (active[sessionId]) return active[sessionId].requestId;
    const requestId = crypto.randomUUID();
    active[sessionId] = { requestId, expiresAt: now + 10 * 60 * 1000 };
    sessionStorage.setItem(CLAIM_REQUEST_STORAGE_KEY, JSON.stringify(active));
    return requestId;
  } catch {
    // The in-memory fallback is stable for retries in this page. A browser
    // that blocks sessionStorage may require a new invitation after reload.
    const existing = claimRequestFallback.get(sessionId);
    if (existing) return existing;
    const requestId = crypto.randomUUID();
    claimRequestFallback.set(sessionId, requestId);
    return requestId;
  }
}

const claimRequestFallback = new Map<string, string>();

function forgetClaimRequestId(sessionId: string) {
  claimRequestFallback.delete(sessionId);
  try {
    const raw = sessionStorage.getItem(CLAIM_REQUEST_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    delete parsed[sessionId];
    sessionStorage.setItem(CLAIM_REQUEST_STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): ProtocolBytes {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError("invalid_base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createPeerConnection(): RTCPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new BrowserP2PError("unsupported_browser", "WebRTC data channels are unavailable in this browser.");
  }
  return new RTCPeerConnection({
    iceServers: [{ urls: P2P_STUN_URL }],
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
  });
}

export function createInitiatorDataChannel(connection: RTCPeerConnection): RTCDataChannel {
  const channel = connection.createDataChannel(DATA_CHANNEL_LABEL, {
    ordered: true,
    protocol: DATA_CHANNEL_LABEL,
  });
  configureDataChannel(channel);
  return channel;
}

export function configureDataChannel(channel: RTCDataChannel): void {
  if (
    channel.label !== DATA_CHANNEL_LABEL ||
    channel.protocol !== DATA_CHANNEL_LABEL ||
    channel.ordered !== true ||
    channel.maxPacketLifeTime !== null ||
    channel.maxRetransmits !== null ||
    channel.negotiated !== false
  ) {
    channel.close();
    throw new BrowserP2PError("channel_unavailable", "The peer opened an unsupported data channel.");
  }
  channel.binaryType = "arraybuffer";
  channel.bufferedAmountLowThreshold = LOW_BUFFERED_BYTES;
}

export function sendTextFrame(channel: RTCDataChannel, frame: TextFrame): void {
  if (channel.readyState !== "open") {
    throw new BrowserP2PError("channel_unavailable", "The direct connection is not open.");
  }
  if (channel.bufferedAmount > MAX_BUFFERED_BYTES) {
    throw new BrowserP2PError("channel_backpressure", "The direct connection is temporarily busy.");
  }
  channel.send(serializeTextFrame(frame));
}

export async function waitForIceGathering(
  connection: RTCPeerConnection,
  timeoutMs = ICE_GATHER_TIMEOUT_MS,
): Promise<RTCSessionDescriptionInit> {
  if (!connection.localDescription) {
    throw new BrowserP2PError("ice_gather_failed", "The browser did not create connection details.");
  }
  if (connection.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        connection.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      };
      const onStateChange = () => {
        if (connection.iceGatheringState === "complete") finish();
      };
      const timeout = window.setTimeout(finish, timeoutMs);
      connection.addEventListener("icegatheringstatechange", onStateChange);
    });
  }
  if (connection.iceGatheringState !== "complete") {
    throw new BrowserP2PError(
      "ice_gather_failed",
      "STUN candidate gathering did not finish within ten seconds.",
    );
  }
  const description = connection.localDescription;
  if (!description?.sdp || (description.type !== "offer" && description.type !== "answer")) {
    throw new BrowserP2PError("ice_gather_failed", "The browser did not gather usable connection details.");
  }
  return { type: description.type, sdp: description.sdp };
}

export function formatSafetyCode(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 24), (byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join("")
    .match(/.{1,4}/gu)!
    .join(" ");
}
