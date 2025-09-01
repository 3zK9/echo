-- Rename legacy table "Tweet" to "Echo" if present, and adjust indexes/constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Tweet'
  ) THEN
    -- Only rename if target doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Echo'
    ) THEN
      EXECUTE 'ALTER TABLE "Tweet" RENAME TO "Echo"';
    END IF;

    -- Rename known indexes created in earlier guarded migrations
    IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'Tweet_originalId_idx') THEN
      EXECUTE 'ALTER INDEX "Tweet_originalId_idx" RENAME TO "Echo_originalId_idx"';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'Tweet_replyToId_idx') THEN
      EXECUTE 'ALTER INDEX "Tweet_replyToId_idx" RENAME TO "Echo_replyToId_idx"';
    END IF;

    -- Rename common FK constraint names if present
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'Echo' AND constraint_name = 'Tweet_originalId_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE "Echo" RENAME CONSTRAINT "Tweet_originalId_fkey" TO "Echo_originalId_fkey"';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'Echo' AND constraint_name = 'Tweet_authorId_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE "Echo" RENAME CONSTRAINT "Tweet_authorId_fkey" TO "Echo_authorId_fkey"';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'Echo' AND constraint_name = 'Tweet_replyToId_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE "Echo" RENAME CONSTRAINT "Tweet_replyToId_fkey" TO "Echo_replyToId_fkey"';
    END IF;
  END IF;
END$$;
