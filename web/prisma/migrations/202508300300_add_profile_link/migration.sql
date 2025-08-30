-- Add optional link field to Profile
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "link" TEXT;

