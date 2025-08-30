-- Index for fast repost counts/lookups (guarded)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Tweet'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Tweet_originalId_idx" ON "Tweet" ("originalId")';
  END IF;
END$$;

-- Composite index to speed likes listing per user by recency (guarded)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Like'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Like_userId_createdAt_idx" ON "Like" ("userId", "createdAt" DESC)';
  END IF;
END$$;
