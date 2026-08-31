-- Live-only WebRTC signaling. No text message body is accepted by or stored
-- in these tables. Envelopes contain signed, end-to-end encrypted SDP/ICE and
-- are physically deleted on close, key replacement, or expiry cleanup.
CREATE TYPE "RtcSessionState" AS ENUM ('CREATED', 'OFFERED', 'CLAIMED', 'CLOSED');
CREATE TYPE "RtcSignalPhase" AS ENUM ('OFFER', 'ANSWER');

CREATE TABLE "RtcDevice" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "signingPublicKey" TEXT NOT NULL,
  "agreementPublicKey" TEXT NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "onlineUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RtcDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RtcDevice_public_key_size_check" CHECK (
    OCTET_LENGTH("signingPublicKey") <= 2048
    AND OCTET_LENGTH("agreementPublicKey") <= 2048
  ),
  CONSTRAINT "RtcDevice_fingerprint_check" CHECK (
    "fingerprint" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE "RtcSession" (
  "id" UUID NOT NULL,
  "callerUserId" TEXT NOT NULL,
  "calleeUserId" TEXT NOT NULL,
  "callerDeviceId" UUID NOT NULL,
  "calleeDeviceId" UUID NOT NULL,
  "createRequestId" UUID NOT NULL,
  "pairKey" TEXT NOT NULL,
  "state" "RtcSessionState" NOT NULL DEFAULT 'CREATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "claimRequestId" UUID,
  "closedAt" TIMESTAMP(3),

  CONSTRAINT "RtcSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RtcSession_distinct_users_check" CHECK ("callerUserId" <> "calleeUserId"),
  CONSTRAINT "RtcSession_distinct_devices_check" CHECK ("callerDeviceId" <> "calleeDeviceId"),
  CONSTRAINT "RtcSession_expiry_check" CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '10 minutes'
  ),
  CONSTRAINT "RtcSession_claim_consistency_check" CHECK (
    ("claimedAt" IS NULL) = ("claimRequestId" IS NULL)
    AND ("state" <> 'CLAIMED' OR "claimedAt" IS NOT NULL)
  ),
  CONSTRAINT "RtcSession_close_consistency_check" CHECK (
    ("state" = 'CLOSED') = ("closedAt" IS NOT NULL)
    AND ("closedAt" IS NULL OR "closedAt" <= "expiresAt")
  )
);

CREATE TABLE "RtcSignal" (
  "id" BIGSERIAL NOT NULL,
  "sessionId" UUID NOT NULL,
  "senderDeviceId" UUID NOT NULL,
  "recipientDeviceId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "phase" "RtcSignalPhase" NOT NULL,
  "envelope" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RtcSignal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RtcSignal_sequence_check" CHECK ("sequence" = 0),
  CONSTRAINT "RtcSignal_distinct_devices_check" CHECK ("senderDeviceId" <> "recipientDeviceId"),
  CONSTRAINT "RtcSignal_envelope_size_check" CHECK (OCTET_LENGTH("envelope") <= 65536)
);

CREATE UNIQUE INDEX "RtcDevice_userId_key" ON "RtcDevice"("userId");
CREATE UNIQUE INDEX "RtcDevice_id_userId_key" ON "RtcDevice"("id", "userId");
CREATE INDEX "RtcDevice_onlineUntil_idx" ON "RtcDevice"("onlineUntil");

CREATE UNIQUE INDEX "RtcSession_callerDeviceId_createRequestId_key"
  ON "RtcSession"("callerDeviceId", "createRequestId");
CREATE INDEX "RtcSession_callerDeviceId_state_expiresAt_idx"
  ON "RtcSession"("callerDeviceId", "state", "expiresAt");
CREATE INDEX "RtcSession_calleeDeviceId_state_expiresAt_idx"
  ON "RtcSession"("calleeDeviceId", "state", "expiresAt");
CREATE INDEX "RtcSession_pairKey_state_expiresAt_idx"
  ON "RtcSession"("pairKey", "state", "expiresAt");
CREATE INDEX "RtcSession_expiresAt_idx" ON "RtcSession"("expiresAt");
-- CLOSED rows are rate-limit/idempotency tombstones only. Excluding them here
-- permits a new call while retaining the prior attempt until its original
-- ten-minute expiry.
CREATE UNIQUE INDEX "RtcSession_pairKey_active_key"
  ON "RtcSession"("pairKey")
  WHERE "state" IN ('CREATED', 'OFFERED', 'CLAIMED');

CREATE UNIQUE INDEX "RtcSignal_sessionId_phase_key"
  ON "RtcSignal"("sessionId", "phase");
CREATE UNIQUE INDEX "RtcSignal_sessionId_senderDeviceId_sequence_key"
  ON "RtcSignal"("sessionId", "senderDeviceId", "sequence");
CREATE INDEX "RtcSignal_recipientDeviceId_id_idx"
  ON "RtcSignal"("recipientDeviceId", "id");
CREATE INDEX "RtcSignal_expiresAt_idx" ON "RtcSignal"("expiresAt");

ALTER TABLE "RtcDevice" ADD CONSTRAINT "RtcDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RtcSession" ADD CONSTRAINT "RtcSession_callerUserId_fkey"
  FOREIGN KEY ("callerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RtcSession" ADD CONSTRAINT "RtcSession_calleeUserId_fkey"
  FOREIGN KEY ("calleeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RtcSession" ADD CONSTRAINT "RtcSession_callerDeviceId_callerUserId_fkey"
  FOREIGN KEY ("callerDeviceId", "callerUserId") REFERENCES "RtcDevice"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RtcSession" ADD CONSTRAINT "RtcSession_calleeDeviceId_calleeUserId_fkey"
  FOREIGN KEY ("calleeDeviceId", "calleeUserId") REFERENCES "RtcDevice"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RtcSignal" ADD CONSTRAINT "RtcSignal_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "RtcSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RtcSignal" ADD CONSTRAINT "RtcSignal_senderDeviceId_fkey"
  FOREIGN KEY ("senderDeviceId") REFERENCES "RtcDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RtcSignal" ADD CONSTRAINT "RtcSignal_recipientDeviceId_fkey"
  FOREIGN KEY ("recipientDeviceId") REFERENCES "RtcDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GitHub handles are case-insensitive. This prevents ambiguous target
-- resolution even though the original Prisma uniqueness is case-sensitive.
CREATE UNIQUE INDEX "User_username_lower_key"
  ON "User" (LOWER("username"))
  WHERE "username" IS NOT NULL;

-- Aggregate-only owner dashboard surface: no identifiers, public keys,
-- usernames, peer pairs, SDP/ICE, or ciphertext are exposed.
CREATE VIEW "AdminP2PMessagingHealth" AS
SELECT
  (SELECT COUNT(*) FROM "RtcDevice")::bigint AS "registeredDevices",
  (
    SELECT COUNT(*) FROM "RtcDevice"
    WHERE "onlineUntil" > CURRENT_TIMESTAMP
  )::bigint AS "onlineDevices",
  (
    SELECT COUNT(*) FROM "RtcSession"
    WHERE "state" <> 'CLOSED'
      AND "expiresAt" > CURRENT_TIMESTAMP
  )::bigint AS "activeSessions",
  (
    SELECT COUNT(*) FROM "RtcSignal"
    WHERE "expiresAt" > CURRENT_TIMESTAMP
  )::bigint AS "encryptedSignals",
  (
    SELECT COUNT(*) FROM "RtcSession"
    WHERE "expiresAt" <= CURRENT_TIMESTAMP
  )::bigint AS "expiredSessionBacklog";

REVOKE ALL ON "AdminP2PMessagingHealth" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'echo_metrics_reader') THEN
    GRANT SELECT ON "AdminP2PMessagingHealth" TO echo_metrics_reader;
  END IF;
END $$;
