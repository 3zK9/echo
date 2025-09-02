-- RenameIndex
ALTER INDEX "DMMessage_from_to_sent_idx" RENAME TO "DMMessage_fromUserId_toUserId_sentAt_idx";

-- RenameIndex
ALTER INDEX "DMMessage_to_sent_idx" RENAME TO "DMMessage_toUserId_sentAt_idx";

-- RenameIndex
ALTER INDEX "PreKey_device_consumed_idx" RENAME TO "PreKey_deviceId_consumedAt_idx";

-- RenameIndex
ALTER INDEX "SignedPreKey_device_created_idx" RENAME TO "SignedPreKey_deviceId_createdAt_idx";
