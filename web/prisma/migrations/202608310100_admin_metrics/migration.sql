-- Registration timestamps are needed for forward-looking signup metrics.
-- Existing rows are backfilled to the migration time because the old schema
-- did not retain their original registration time.
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3);
UPDATE "User" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "createdAt" SET NOT NULL;

CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "Account_userId_provider_idx" ON "Account"("userId", "provider");

-- The original init migration created "EchoLike", while the current Prisma
-- model maps EchoLike to "Like". Existing deployments already use "Like";
-- align fresh migration histories without disturbing those databases.
DO $$
BEGIN
  IF TO_REGCLASS('public."Like"') IS NULL
    AND TO_REGCLASS('public."EchoLike"') IS NOT NULL THEN
    ALTER TABLE "EchoLike" RENAME TO "Like";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EchoLike_pkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Like_pkey'
  ) THEN
    ALTER TABLE "Like" RENAME CONSTRAINT "EchoLike_pkey" TO "Like_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EchoLike_userId_fkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Like_userId_fkey'
  ) THEN
    ALTER TABLE "Like" RENAME CONSTRAINT "EchoLike_userId_fkey" TO "Like_userId_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EchoLike_echoId_fkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Like_echoId_fkey'
  ) THEN
    ALTER TABLE "Like" RENAME CONSTRAINT "EchoLike_echoId_fkey" TO "Like_echoId_fkey";
  END IF;

  IF TO_REGCLASS('public."EchoLike_echoId_idx"') IS NOT NULL
    AND TO_REGCLASS('public."Like_echoId_idx"') IS NULL THEN
    ALTER INDEX "EchoLike_echoId_idx" RENAME TO "Like_echoId_idx";
  END IF;

  IF TO_REGCLASS('public."EchoLike_userId_createdAt_idx"') IS NOT NULL
    AND TO_REGCLASS('public."Like_userId_createdAt_idx"') IS NULL THEN
    ALTER INDEX "EchoLike_userId_createdAt_idx" RENAME TO "Like_userId_createdAt_idx";
  END IF;
END $$;

-- These views are the metrics reader's entire data surface. They intentionally
-- expose aggregate counts only: no IDs, profile data, content, messages, OAuth
-- credentials, or encryption material.
CREATE VIEW "AdminProductTotals" AS
SELECT
  (SELECT COUNT(*) FROM "User")::bigint AS "users",
  (
    SELECT COUNT(*) FROM "Echo"
    WHERE "originalId" IS NULL AND "replyToId" IS NULL
  )::bigint AS "originalEchoes",
  (SELECT COUNT(*) FROM "Echo" WHERE "replyToId" IS NOT NULL)::bigint AS "replies",
  (SELECT COUNT(*) FROM "Echo" WHERE "originalId" IS NOT NULL)::bigint AS "reposts",
  (SELECT COUNT(*) FROM "Like")::bigint AS "likes",
  (
    SELECT COUNT(*) FROM (
      SELECT "authorId" AS "userId"
      FROM "Echo"
      WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days'
      UNION
      SELECT "userId"
      FROM "Like"
      WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    ) AS "active7d"
  )::bigint AS "activeUsers7d",
  (
    SELECT COUNT(*) FROM (
      SELECT "authorId" AS "userId"
      FROM "Echo"
      WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      UNION
      SELECT "userId"
      FROM "Like"
      WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    ) AS "active30d"
  )::bigint AS "activeUsers30d";

CREATE VIEW "AdminDailyActivity" AS
WITH "days" AS (
  SELECT GENERATE_SERIES(
    CURRENT_DATE - INTERVAL '89 days',
    CURRENT_DATE,
    INTERVAL '1 day'
  )::date AS "day"
)
SELECT
  "days"."day" AS "day",
  (
    SELECT COUNT(*) FROM "User"
    WHERE "createdAt" >= "days"."day"
      AND "createdAt" < "days"."day" + INTERVAL '1 day'
  )::bigint AS "registeredUsers",
  (
    SELECT COUNT(*) FROM (
      SELECT "authorId" AS "userId"
      FROM "Echo"
      WHERE "createdAt" >= "days"."day"
        AND "createdAt" < "days"."day" + INTERVAL '1 day'
      UNION
      SELECT "userId"
      FROM "Like"
      WHERE "createdAt" >= "days"."day"
        AND "createdAt" < "days"."day" + INTERVAL '1 day'
    ) AS "dailyActive"
  )::bigint AS "activeUsers",
  (
    SELECT COUNT(*) FROM "Echo"
    WHERE "createdAt" >= "days"."day"
      AND "createdAt" < "days"."day" + INTERVAL '1 day'
      AND "originalId" IS NULL
      AND "replyToId" IS NULL
  )::bigint AS "originalEchoes",
  (
    SELECT COUNT(*) FROM "Echo"
    WHERE "createdAt" >= "days"."day"
      AND "createdAt" < "days"."day" + INTERVAL '1 day'
      AND "replyToId" IS NOT NULL
  )::bigint AS "replies",
  (
    SELECT COUNT(*) FROM "Echo"
    WHERE "createdAt" >= "days"."day"
      AND "createdAt" < "days"."day" + INTERVAL '1 day'
      AND "originalId" IS NOT NULL
  )::bigint AS "reposts",
  (
    SELECT COUNT(*) FROM "Like"
    WHERE "createdAt" >= "days"."day"
      AND "createdAt" < "days"."day" + INTERVAL '1 day'
  )::bigint AS "likes"
FROM "days";
