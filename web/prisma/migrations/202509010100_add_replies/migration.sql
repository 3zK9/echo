-- Add replies support (compatible with both "Tweet" and "Echo" table names)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Tweet'
  ) THEN
    EXECUTE 'ALTER TABLE "Tweet" ADD COLUMN IF NOT EXISTS "replyToId" TEXT';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Tweet_replyToId_idx" ON "Tweet" ("replyToId")';
    -- add self-referencing FK guarded
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'Tweet' AND constraint_name = 'Tweet_replyToId_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Tweet"("id") ON DELETE SET NULL ON UPDATE CASCADE';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Echo'
  ) THEN
    EXECUTE 'ALTER TABLE "Echo" ADD COLUMN IF NOT EXISTS "replyToId" TEXT';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Echo_replyToId_idx" ON "Echo" ("replyToId")';
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'Echo' AND constraint_name = 'Echo_replyToId_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE "Echo" ADD CONSTRAINT "Echo_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Echo"("id") ON DELETE SET NULL ON UPDATE CASCADE';
    END IF;
  END IF;
END$$;
