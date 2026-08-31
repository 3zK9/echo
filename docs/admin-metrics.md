# Owner-only metrics dashboard

`/admin` is a dynamic, non-cacheable server-rendered dashboard. It authorizes a
signed-in user by the immutable numeric GitHub account ID stored in NextAuth's
`Account.providerAccountId`; usernames, email addresses, and browser claims are
not authorization inputs.

## Application configuration

Set these server-only variables in every environment where the dashboard is
expected to work:

```dotenv
ADMIN_GITHUB_ACCOUNT_IDS=12345678
METRICS_DATABASE_URL=postgresql://echo_metrics_app:password@host:6543/database?pgbouncer=true&connection_limit=1
```

`ADMIN_GITHUB_ACCOUNT_IDS` accepts comma-separated numeric IDs. An empty or
invalid allowlist denies access. In production, `METRICS_DATABASE_URL` is
mandatory and the application never falls back to `DATABASE_URL`.

Apply `web/prisma/migrations/202608310100_admin_metrics/migration.sql` before
creating the reader. Existing users receive the migration timestamp because
the prior schema did not retain registration dates; signup history is accurate
from that migration onward.

## Create the read-only database principal

Run the following as a database owner, replacing the example password. Keep
this credential distinct from `DATABASE_URL` and rotate it like any other
production secret.

```sql
CREATE ROLE echo_metrics_reader NOLOGIN;
CREATE ROLE echo_metrics_app
  LOGIN
  PASSWORD 'replace-with-a-generated-secret'
  IN ROLE echo_metrics_reader;

GRANT CONNECT ON DATABASE postgres TO echo_metrics_app;
GRANT USAGE ON SCHEMA public TO echo_metrics_reader;
GRANT SELECT ON "AdminProductTotals", "AdminDailyActivity" TO echo_metrics_reader;

ALTER ROLE echo_metrics_app SET default_transaction_read_only = on;
ALTER ROLE echo_metrics_app SET statement_timeout = '5s';
ALTER ROLE echo_metrics_app SET idle_in_transaction_session_timeout = '5s';
```

Replace `postgres` in the `GRANT CONNECT` statement with the actual database
name. Do not grant this role access to application tables or future views by
default. The aggregate views run with their owner's permissions and expose only
counts; the login role cannot select underlying user, content, OAuth, message,
or cryptographic-key rows.

If your Postgres provider forces view invoker permissions or changes the view
security model, use a dedicated metrics schema with owner-executed
`SECURITY DEFINER` aggregate functions after a database security review. Never
solve permission errors by granting the dashboard role broad table access.

## Verify the boundary

Connect using `METRICS_DATABASE_URL` and confirm:

```sql
SHOW default_transaction_read_only;
SELECT * FROM "AdminProductTotals";
SELECT * FROM "AdminDailyActivity" LIMIT 1;

-- Every statement below must fail.
SELECT * FROM "User" LIMIT 1;
INSERT INTO "User" ("id", "createdAt") VALUES ('must-fail', CURRENT_TIMESTAMP);
UPDATE "User" SET "name" = 'must-fail';
DELETE FROM "User";
```

The dashboard has no mutation handlers, forms, server actions, or operational
controls. `GET` and `HEAD` are the only accepted HTTP methods under `/admin`.
