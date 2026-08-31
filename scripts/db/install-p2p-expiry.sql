-- Production retention control for live-only WebRTC signaling.
-- Run only after the RtcDevice/RtcSession/RtcSignal migration is present.
-- Re-running this file replaces the named job without affecting other jobs.

-- pg_cron owns the `cron` schema; do not force it into an application schema.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $job$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'echo-p2p-expiry-v1'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;
END
$job$;

SELECT cron.schedule(
  'echo-p2p-expiry-v1',
  '* * * * *',
  $command$
    DELETE FROM public."RtcSignal"
      WHERE "expiresAt" <= CURRENT_TIMESTAMP;
    DELETE FROM public."RtcSession"
      WHERE "expiresAt" <= CURRENT_TIMESTAMP;
    UPDATE public."RtcDevice"
      SET "onlineUntil" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "onlineUntil" <= CURRENT_TIMESTAMP;
  $command$
);
