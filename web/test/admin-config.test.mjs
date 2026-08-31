import test from "node:test";
import assert from "node:assert/strict";
import {
  AdminConfigurationError,
  parseAdminGithubAccountIds,
} from "../src/lib/admin-config.ts";
import {
  MetricsConfigurationError,
  resolveMetricsDatabaseUrl,
} from "../src/lib/metrics-config.ts";

test("an absent admin allowlist denies everyone", () => {
  assert.deepEqual(parseAdminGithubAccountIds(undefined), []);
  assert.deepEqual(parseAdminGithubAccountIds("  "), []);
});

test("numeric GitHub account IDs are trimmed and deduplicated", () => {
  assert.deepEqual(
    parseAdminGithubAccountIds(" 76074004,12345,76074004 "),
    ["76074004", "12345"],
  );
});

test("usernames and mixed identifiers fail closed", () => {
  assert.throws(
    () => parseAdminGithubAccountIds("76074004,octocat"),
    AdminConfigurationError,
  );
  assert.throws(
    () => parseAdminGithubAccountIds("76074004@example.com"),
    AdminConfigurationError,
  );
});

test("production metrics require their dedicated database URL", () => {
  assert.throws(
    () => resolveMetricsDatabaseUrl({
      nodeEnv: "production",
      applicationDatabaseUrl: "postgresql://write-capable",
    }),
    MetricsConfigurationError,
  );

  assert.equal(
    resolveMetricsDatabaseUrl({
      nodeEnv: "production",
      metricsDatabaseUrl: "  postgresql://read-only  ",
      applicationDatabaseUrl: "postgresql://write-capable",
    }),
    "postgresql://read-only",
  );
});

test("development may use the application database for local rendering", () => {
  assert.equal(
    resolveMetricsDatabaseUrl({
      nodeEnv: "development",
      applicationDatabaseUrl: " postgresql://local ",
    }),
    "postgresql://local",
  );
});
