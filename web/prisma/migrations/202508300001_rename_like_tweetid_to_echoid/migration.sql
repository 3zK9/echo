-- Safe migration: only run renames if the table/column already exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Like' AND column_name = 'tweetId'
  ) THEN
    EXECUTE 'ALTER TABLE "Like" RENAME COLUMN "tweetId" TO "echoId"';
  END IF;
END$$;

-- Optional: rename foreign key constraint if it exists under the old name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'Like' AND constraint_name = 'Like_tweetId_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "Like" RENAME CONSTRAINT "Like_tweetId_fkey" TO "Like_echoId_fkey"';
  END IF;
END$$;

-- Optional: rename index on tweetId if it exists under the old name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'Like_tweetId_idx'
  ) THEN
    EXECUTE 'ALTER INDEX "Like_tweetId_idx" RENAME TO "Like_echoId_idx"';
  END IF;
END$$;
