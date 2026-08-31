import test from "node:test";
import assert from "node:assert/strict";
import {
  safeCallbackPath,
  safeSameOriginRedirectUrl,
} from "../src/lib/safe-redirect.ts";

test("safe callback paths preserve local paths, queries, and fragments", () => {
  assert.equal(
    safeCallbackPath("/profile/echo?tab=likes#latest"),
    "/profile/echo?tab=likes#latest",
  );
});

test("callback paths reject URL-normalization and decoding tricks", () => {
  for (const value of [
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "/%5cevil.example/path",
    "/%2fevil.example/path",
    "/%2e%2e//evil.example/path",
    "/safe\u0000path",
  ]) {
    assert.equal(safeCallbackPath(value), "/", value);
  }
});

test("OAuth redirects remain on the configured application origin", () => {
  const baseUrl = "https://echo-nine-xi.vercel.app";

  assert.equal(
    safeSameOriginRedirectUrl("/profile?tab=likes", baseUrl),
    "https://echo-nine-xi.vercel.app/profile?tab=likes",
  );
  assert.equal(
    safeSameOriginRedirectUrl(
      "https://echo-nine-xi.vercel.app/echo/123",
      baseUrl,
    ),
    "https://echo-nine-xi.vercel.app/echo/123",
  );

  for (const value of [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "https://echo-nine-xi.vercel.app\\@evil.example/",
  ]) {
    assert.equal(
      safeSameOriginRedirectUrl(value, baseUrl),
      "https://echo-nine-xi.vercel.app/",
      value,
    );
  }
});
