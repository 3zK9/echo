-- CreateIndex
CREATE INDEX "Echo_originalId_idx" ON "Echo"("originalId");

-- CreateIndex
CREATE INDEX "EchoLike_userId_createdAt_idx" ON "EchoLike"("userId", "createdAt");
