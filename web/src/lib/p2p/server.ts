import "server-only";

import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/auth.config";
import { prisma } from "@/lib/db";
import {
  MAX_CONTROL_REQUEST_BYTES,
  P2P_CONTROL_MAX_AGE_MS,
  P2P_CONTROL_MAX_FUTURE_SKEW_MS,
  isP2PMessagingEnabled,
} from "@/lib/p2p/config";
import {
  P2P_PROTOCOL_VERSION,
  P2PProtocolError,
  type DeviceIdentity,
  type P256PublicJwk,
  type SignalMetadata,
  assertIsoDate,
  assertUuid,
  canonicalPublicJwk,
  validateP256PublicJwk,
  verifyP256Signature,
} from "@/lib/p2p/protocol";
import { isAllowedMutationRequest } from "@/lib/security";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Content-Type-Options": "nosniff",
} as const;

export const rtcSessionInclude = {
  caller: { select: { id: true, username: true } },
  callee: { select: { id: true, username: true } },
  callerDevice: true,
  calleeDevice: true,
} as const;

export type RtcSessionWithParties = Prisma.RtcSessionGetPayload<{
  include: typeof rtcSessionInclude;
}>;

export type AuthenticatedP2PUser = {
  id: string;
  username: string;
};

export class P2PHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "P2PHttpError";
  }
}

export function p2pJson(value: unknown, init?: { status?: number }) {
  return NextResponse.json(value, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  });
}

export function p2pEmpty(status = 204) {
  return new NextResponse(null, { status, headers: NO_STORE_HEADERS });
}

export function p2pErrorResponse(error: unknown): NextResponse {
  if (error instanceof P2PHttpError) {
    return p2pJson({ error: error.code }, { status: error.status });
  }
  if (error instanceof P2PProtocolError || error instanceof SyntaxError) {
    return p2pJson({ error: "invalid_request" }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return p2pJson({ error: "session_conflict" }, { status: 409 });
    }
    if (error.code === "P2034") {
      return p2pJson({ error: "request_conflict" }, { status: 409 });
    }
    console.error(`P2P database request failed (${error.code}).`);
  } else {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`P2P request failed (${name}).`);
  }
  return p2pJson({ error: "temporarily_unavailable" }, { status: 503 });
}

export function assertP2PEnabled() {
  if (!isP2PMessagingEnabled()) {
    throw new P2PHttpError(404, "not_found");
  }
}

export async function requireP2PUser(): Promise<AuthenticatedP2PUser> {
  assertP2PEnabled();
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new P2PHttpError(401, "unauthorized");

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      accounts: { some: { provider: "github" } },
    },
    select: { id: true, username: true },
  });
  if (!user?.username) throw new P2PHttpError(409, "profile_required");
  return { id: user.id, username: user.username };
}

export async function requireP2PMutation(req: Request): Promise<AuthenticatedP2PUser> {
  assertP2PEnabled();
  if (!isAllowedMutationRequest(req)) {
    throw new P2PHttpError(403, "forbidden");
  }
  return requireP2PUser();
}

export async function readP2PJson(
  req: Request,
  maximumBytes = MAX_CONTROL_REQUEST_BYTES,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new P2PHttpError(415, "json_required");
  }
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new P2PHttpError(413, "request_too_large");
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) {
    throw new P2PHttpError(413, "request_too_large");
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new P2PProtocolError("Request body must be an object.");
  }
  return value as Record<string, unknown>;
}

export function assertBodyKeys(
  body: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !(key in body)) ||
    Object.keys(body).some((key) => !allowed.has(key))
  ) {
    throw new P2PProtocolError("Request contains unsupported or missing fields.");
  }
}

export function requireString(value: unknown, name: string, maximumLength = 512): string {
  if (typeof value !== "string" || !value || value.length > maximumLength) {
    throw new P2PProtocolError(`${name} must be a bounded string.`);
  }
  return value;
}

export function validateIssuedAt(value: unknown, now = Date.now()): string {
  const issuedAt = assertIsoDate(value, "issuedAt");
  const timestamp = Date.parse(issuedAt);
  if (
    timestamp < now - P2P_CONTROL_MAX_AGE_MS ||
    timestamp > now + P2P_CONTROL_MAX_FUTURE_SKEW_MS
  ) {
    throw new P2PHttpError(403, "stale_device_proof");
  }
  return issuedAt;
}

export function parseStoredPublicKey(
  value: string,
  usage: "signing" | "agreement",
): P256PublicJwk {
  return validateP256PublicJwk(JSON.parse(value), usage);
}

export async function verifyDeviceProof(
  signingPublicKey: P256PublicJwk,
  signedBytes: Uint8Array,
  signatureValue: unknown,
) {
  const signature = requireString(signatureValue, "signature", 128);
  let valid = false;
  try {
    valid = await verifyP256Signature(signingPublicKey, signedBytes, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new P2PHttpError(403, "invalid_device_proof");
}

export async function requireOwnedDevice(userId: string, deviceIdValue: unknown) {
  const deviceId = assertUuid(deviceIdValue, "deviceId");
  const device = await prisma.rtcDevice.findFirst({
    where: { id: deviceId, userId },
  });
  if (!device) throw new P2PHttpError(404, "not_found");
  return device;
}

export function deviceIdentity(
  device: {
    id: string;
    userId: string;
    signingPublicKey: string;
    agreementPublicKey: string;
    fingerprint: string;
  },
  user: { id: string; username: string | null },
): DeviceIdentity {
  if (device.userId !== user.id || !user.username) {
    throw new P2PHttpError(409, "peer_unavailable");
  }
  return {
    deviceId: device.id,
    userId: user.id,
    username: user.username,
    signingPublicKey: parseStoredPublicKey(device.signingPublicKey, "signing"),
    agreementPublicKey: parseStoredPublicKey(device.agreementPublicKey, "agreement"),
    fingerprint: device.fingerprint,
  };
}

export function sessionView(session: RtcSessionWithParties, userId: string) {
  const caller = userId === session.callerUserId;
  if (!caller && userId !== session.calleeUserId) {
    throw new P2PHttpError(404, "not_found");
  }
  return {
    id: session.id,
    role: caller ? "caller" as const : "callee" as const,
    state: session.state.toLowerCase(),
    expiresAt: session.expiresAt.toISOString(),
    self: caller
      ? deviceIdentity(session.callerDevice, session.caller)
      : deviceIdentity(session.calleeDevice, session.callee),
    peer: caller
      ? deviceIdentity(session.calleeDevice, session.callee)
      : deviceIdentity(session.callerDevice, session.caller),
  };
}

export function signalMetadata(
  session: RtcSessionWithParties,
  phase: "offer" | "answer",
  offerHash?: string,
): SignalMetadata {
  const senderIsCaller = phase === "offer";
  const senderDevice = senderIsCaller ? session.callerDevice : session.calleeDevice;
  const recipientDevice = senderIsCaller ? session.calleeDevice : session.callerDevice;
  return {
    version: P2P_PROTOCOL_VERSION,
    sessionId: session.id,
    phase,
    sequence: 0,
    senderUserId: senderIsCaller ? session.callerUserId : session.calleeUserId,
    recipientUserId: senderIsCaller ? session.calleeUserId : session.callerUserId,
    senderDeviceId: senderDevice.id,
    recipientDeviceId: recipientDevice.id,
    senderFingerprint: senderDevice.fingerprint,
    recipientFingerprint: recipientDevice.fingerprint,
    expiresAt: session.expiresAt.toISOString(),
    ...(offerHash ? { offerHash } : {}),
  };
}

export function canonicalDeviceKeyStorage(key: P256PublicJwk): string {
  return canonicalPublicJwk(key);
}

export function p2pPairKey(firstUserId: string, secondUserId: string): string {
  const [first, second] = [firstUserId, secondUserId].sort();
  return `${first.length}:${first}${second.length}:${second}`;
}

export async function cleanupExpiredP2P(now = new Date()) {
  await prisma.$transaction(async (transaction) => {
    await transaction.rtcSignal.deleteMany({ where: { expiresAt: { lte: now } } });
    await transaction.rtcSession.deleteMany({ where: { expiresAt: { lte: now } } });
    await transaction.rtcDevice.updateMany({
      where: { onlineUntil: { lte: now } },
      data: { onlineUntil: null },
    });
  });
}

export async function withSerializableRetry<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new P2PHttpError(409, "request_conflict");
}
