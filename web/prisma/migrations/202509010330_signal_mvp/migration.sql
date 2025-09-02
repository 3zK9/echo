-- Devices table
CREATE TABLE IF NOT EXISTS "Device" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "registrationId" INTEGER NOT NULL,
  "identityKeyPub" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Device_userId_createdAt_idx" ON "Device"("userId","createdAt");

-- SignedPreKey
CREATE TABLE IF NOT EXISTS "SignedPreKey" (
  "deviceId" TEXT NOT NULL,
  "keyId" INTEGER NOT NULL,
  "pubKey" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("deviceId","keyId"),
  CONSTRAINT "SignedPreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SignedPreKey_device_created_idx" ON "SignedPreKey"("deviceId","createdAt");

-- PreKey
CREATE TABLE IF NOT EXISTS "PreKey" (
  "deviceId" TEXT NOT NULL,
  "keyId" INTEGER NOT NULL,
  "pubKey" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3),
  PRIMARY KEY ("deviceId","keyId"),
  CONSTRAINT "PreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PreKey_device_consumed_idx" ON "PreKey"("deviceId","consumedAt");

-- DMMessage
CREATE TABLE IF NOT EXISTS "DMMessage" (
  "id" TEXT PRIMARY KEY,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "senderDeviceId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  CONSTRAINT "DMMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DMMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DMMessage_senderDeviceId_fkey" FOREIGN KEY ("senderDeviceId") REFERENCES "Device"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DMMessage_from_to_sent_idx" ON "DMMessage"("fromUserId","toUserId","sentAt");
CREATE INDEX IF NOT EXISTS "DMMessage_to_sent_idx" ON "DMMessage"("toUserId","sentAt");
