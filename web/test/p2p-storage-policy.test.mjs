import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../prisma/migrations/202608310300_live_p2p_signaling/migration.sql",
  import.meta.url,
);

test("the signaling migration retains bounded CLOSED tombstones but never message bodies", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /'CREATED', 'OFFERED', 'CLAIMED', 'CLOSED'/);
  assert.match(sql, /WHERE "state" IN \('CREATED', 'OFFERED', 'CLAIMED'\)/);
  assert.match(sql, /"RtcSignal_envelope_size_check"/);
  assert.doesNotMatch(sql, /CREATE TABLE "(?:RtcMessage|Message|DMMessage)"/);
  assert.doesNotMatch(sql, /"(?:text|body|messageBody)"\s+TEXT/);
});

test("target identity and owner metrics constraints are installed at the database boundary", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX "User_username_lower_key"[\s\S]*LOWER\("username"\)/);
  assert.match(sql, /CREATE VIEW "AdminP2PMessagingHealth"/);
  assert.match(sql, /REVOKE ALL ON "AdminP2PMessagingHealth" FROM PUBLIC/);
  assert.match(sql, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'echo_metrics_reader'\)/);

  const view = sql.slice(sql.indexOf('CREATE VIEW "AdminP2PMessagingHealth"'));
  for (const forbidden of ["username", "fingerprint", "signingPublicKey", "agreementPublicKey", "envelope"]) {
    assert.doesNotMatch(view, new RegExp(`"${forbidden}"`, "i"));
  }
});

test("close and key replacement lock CLOSED state before atomically deleting encrypted signals", async () => {
  const [closeRoute, deviceRoute] = await Promise.all([
    readFile(new URL("../src/app/api/p2p/sessions/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/p2p/device/route.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [closeRoute, deviceRoute]) {
    assert.ok(source.indexOf("rtcSignal.deleteMany") >= 0);
    assert.ok(source.indexOf("rtcSession.updateMany") < source.indexOf("rtcSignal.deleteMany"));
    assert.match(source, /state: "CLOSED"/);
  }
});

test("session creation counts caller and callee abuse including CLOSED attempts", async () => {
  const source = await readFile(
    new URL("../src/app/api/p2p/sessions/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const recentCount = await transaction\.rtcSession\.count/);
  assert.match(source, /const targetActiveCount = await transaction\.rtcSession\.count/);
  assert.match(source, /const targetRecentInboundCount = await transaction\.rtcSession\.count/);
  assert.match(source, /targets\.length === 1/);
});

test("live messaging loads no third-party browser telemetry and API polls stay JSON", async () => {
  const [layout, middleware, manifest] = await Promise.all([
    readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../middleware.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(layout, /@vercel\/(?:analytics|speed-insights)/);
  assert.doesNotMatch(manifest, /@vercel\/(?:analytics|speed-insights)/);
  assert.match(middleware, /pathname === "\/api\/p2p"/);
  assert.match(middleware, /NextResponse\.json\(\s*\{ error: "unauthorized" \}/);
});

test("a device-key replacement needs an explicit, signed user choice", async () => {
  const [browser, lobby, deviceRoute] = await Promise.all([
    readFile(new URL("../src/lib/p2p/browser.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/p2p/MessagesLobby.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/p2p/device/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(browser, /replaceExisting: true/);
  assert.match(browser, /registrationSigningBytes\(signed\)/);
  assert.match(lobby, /Replace registered browser/);
  assert.match(lobby, /replacementConfirmed/);
  assert.match(deviceRoute, /keysChanged && !replaceExisting/);
});

test("the production retention job uses pg_cron's owned schema and runs every minute", async () => {
  const sql = await readFile(new URL("../../scripts/db/install-p2p-expiry.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_cron;/);
  assert.doesNotMatch(sql, /WITH SCHEMA pg_catalog/);
  assert.match(sql, /cron\.schedule\([\s\S]*'\* \* \* \* \*'/);
  assert.match(sql, /DELETE FROM public\."RtcSignal"/);
  assert.match(sql, /DELETE FROM public\."RtcSession"/);
});

test("answer insertion re-checks and locks CLAIMED state against a concurrent close", async () => {
  const source = await readFile(
    new URL("../src/app/api/p2p/sessions/[id]/signal/route.ts", import.meta.url),
    "utf8",
  );
  const transaction = source.slice(source.indexOf("await withSerializableRetry"));
  assert.match(transaction, /else \{[\s\S]*transaction\.rtcSession\.updateMany/);
  assert.match(transaction, /state: "CLAIMED"[\s\S]*expiresAt: \{ gt: now \}/);
  assert.ok(transaction.indexOf("claimed.count !== 1") < transaction.indexOf("transaction.rtcSignal.create"));
});
