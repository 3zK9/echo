import test from "node:test";
import assert from "node:assert/strict";
import { buildContentSecurityPolicy } from "../src/lib/content-security-policy.ts";

const nonce = "dGVzdC1ub25jZQ==";

test("production CSP uses a nonce without unsafe script or style execution", () => {
  const policy = buildContentSecurityPolicy(nonce, false);

  assert.match(policy, new RegExp(`script-src [^;]*'nonce-${nonce}'`));
  assert.match(policy, /script-src [^;]*'strict-dynamic'/);
  assert.match(policy, new RegExp(`style-src 'self' 'nonce-${nonce}'`));
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /style-src-attr 'none'/);
  assert.match(policy, /media-src 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-src 'none'/);
  assert.doesNotMatch(policy, /'unsafe-inline'/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
  assert.doesNotMatch(policy, /\bws:/);
  assert.doesNotMatch(policy, /vercel-insights/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("development CSP adds only the eval and websocket allowances Next needs", () => {
  const policy = buildContentSecurityPolicy(nonce, true);

  assert.match(policy, /script-src [^;]*'unsafe-eval'/);
  assert.match(policy, /connect-src [^;]* ws: wss:/);
  assert.doesNotMatch(policy, /'unsafe-inline'/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("a nonce cannot inject another CSP directive", () => {
  assert.throws(
    () => buildContentSecurityPolicy("safe'; connect-src *", false),
    /unsupported characters/,
  );
});
