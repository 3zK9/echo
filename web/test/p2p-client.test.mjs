import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  P2PFrameError,
  TEXT_FRAME_MAX_CHARACTERS,
  TEXT_FRAME_MAX_ENCODED_BYTES,
  TEXT_FRAME_MAX_UTF8_BYTES,
  TEXT_FRAME_PROTOCOL_VERSION,
  createTextFrame,
  normalizeOutgoingText,
  parseTextFrame,
  serializeTextFrame,
  validateMessageText,
} from "../src/lib/p2p/frames.ts";
import {
  MAX_DATA_FRAME_BYTES,
  MAX_TEXT_CHARACTERS,
  MAX_TEXT_UTF8_BYTES,
  P2P_PROTOCOL_VERSION,
} from "../src/lib/p2p/protocol.ts";
import {
  P2PSdpError,
  assertPrivacyPreservingRemoteSdp,
  hasUsableIceCandidate,
  redactNumericHostCandidates,
  validateDataOnlySdp,
} from "../src/lib/p2p/sdp.ts";

const ID = "123e4567-e89b-42d3-a456-426614174000";

test("text-frame limits remain synchronized with the signaling protocol", () => {
  assert.equal(TEXT_FRAME_PROTOCOL_VERSION, P2P_PROTOCOL_VERSION);
  assert.equal(TEXT_FRAME_MAX_CHARACTERS, MAX_TEXT_CHARACTERS);
  assert.equal(TEXT_FRAME_MAX_UTF8_BYTES, MAX_TEXT_UTF8_BYTES);
  assert.equal(TEXT_FRAME_MAX_ENCODED_BYTES, MAX_DATA_FRAME_BYTES);
});

test("a text frame has one exact, text-only shape", () => {
  const frame = createTextFrame("hello", ID);
  assert.deepEqual(frame, { v: 1, type: "text", id: ID, text: "hello" });
  assert.deepEqual(parseTextFrame(serializeTextFrame(frame)), frame);

  for (const extra of [
    { media: "photo" },
    { url: "https://example.test" },
    { attachment: { name: "file" } },
    { blob: "AAAA" },
    { html: "<b>hello</b>" },
  ]) {
    assert.throws(
      () => parseTextFrame(JSON.stringify({ ...frame, ...extra })),
      (error) => error instanceof P2PFrameError && error.code === "invalid_message",
    );
  }
});

test("non-string, malformed, missing, and wrong-version frames fail closed", () => {
  const invalid = [
    new Uint8Array([1, 2, 3]),
    new ArrayBuffer(4),
    null,
    1,
    "not-json",
    "[]",
    JSON.stringify({ v: 1, type: "text", id: ID }),
    JSON.stringify({ v: 2, type: "text", id: ID, text: "hello" }),
    JSON.stringify({ v: 1, type: "binary", id: ID, text: "hello" }),
  ];
  for (const value of invalid) {
    assert.throws(() => parseTextFrame(value), P2PFrameError);
  }
});

test("frame identifiers must be canonical random UUIDv4 values", () => {
  for (const id of [
    "",
    "123e4567-e89b-12d3-a456-426614174000",
    "123E4567-E89B-42D3-A456-426614174000-extra",
    "../../session",
  ]) {
    assert.throws(() => createTextFrame("hello", id), P2PFrameError);
    assert.throws(
      () => parseTextFrame(JSON.stringify({ v: 1, type: "text", id, text: "hello" })),
      P2PFrameError,
    );
  }
});

test("outgoing line endings normalize while forbidden controls and lone surrogates are rejected", () => {
  assert.equal(normalizeOutgoingText("one\r\ntwo\rthree"), "one\ntwo\nthree");
  assert.equal(createTextFrame("one\r\ntwo", ID).text, "one\ntwo");
  assert.equal(validateMessageText("tab\tok\nline"), true);

  for (const text of [
    "nul\u0000",
    "escape\u001b",
    "delete\u007f",
    "carriage\rreturn",
    "high\ud800",
    "low\udc00",
  ]) {
    assert.equal(validateMessageText(text), false);
    assert.throws(
      () => parseTextFrame(JSON.stringify({ v: 1, type: "text", id: ID, text })),
      P2PFrameError,
    );
  }
});

test("UTF-8 byte and Unicode-character boundaries are enforced", () => {
  const exactlyFourKiB = "😀".repeat(1_024);
  const overFourKiB = `${exactlyFourKiB}😀`;
  assert.equal(new TextEncoder().encode(exactlyFourKiB).byteLength, 4_096);
  assert.equal(validateMessageText(exactlyFourKiB), true);
  assert.equal(validateMessageText(overFourKiB), false);
  assert.doesNotThrow(() => createTextFrame(exactlyFourKiB, ID));
  assert.throws(() => createTextFrame(overFourKiB, ID), P2PFrameError);

  assert.equal(validateMessageText("a".repeat(TEXT_FRAME_MAX_CHARACTERS)), true);
  assert.equal(validateMessageText("a".repeat(TEXT_FRAME_MAX_CHARACTERS + 1)), false);
});

test("oversized encoded input is rejected before JSON parsing", () => {
  const oversized = "{" + "x".repeat(TEXT_FRAME_MAX_ENCODED_BYTES) + "}";
  assert.throws(
    () => parseTextFrame(oversized),
    (error) => error instanceof P2PFrameError && error.code === "message_too_large",
  );
});

test("message URLs never contain signaling-session identifiers", async () => {
  const [lobby, room] = await Promise.all([
    readFile(new URL("../src/components/p2p/MessagesLobby.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/p2p/LiveRoom.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(lobby, /[?&]session=/);
  assert.doesNotMatch(room, /incomingSessionId|[?&]session=/);
});

test("client cleanup fails closed when ICE gathering misses its bound", async () => {
  const browserSource = await readFile(new URL("../src/lib/p2p/browser.ts", import.meta.url), "utf8");
  assert.match(browserSource, /iceGatheringState !== "complete"/);
  assert.match(browserSource, /STUN candidate gathering did not finish within ten seconds/);
  assert.match(browserSource, /navigator\.locks\.request/);
  assert.match(browserSource, /echo-p2p-pin:/);
  assert.match(browserSource, /CLAIM_REQUEST_STORAGE_KEY/);
  assert.match(browserSource, /response\.status === 204/);
  assert.match(browserSource, /redactNumericHostCandidates/);
  assert.match(browserSource, /No privacy-preserving network candidate was available/);
});

test("even authenticated SDP is restricted to one data-channel section", () => {
  const valid = [
    "v=0",
    "o=- 1 2 IN IP4 0.0.0.0",
    "s=-",
    "t=0 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=sctp-port:5000",
    "",
  ].join("\r\n");
  assert.equal(validateDataOnlySdp(valid), valid);

  for (const injectedLine of [
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "m=video 9 UDP/TLS/RTP/SAVPF 96",
    "a=msid:stream track",
    "a=ssrc:1234 cname:media",
    "a=rtpmap:111 opus/48000/2",
    "a=sendrecv",
  ]) {
    const hostile = valid.replace("a=sctp-port:5000", `a=sctp-port:5000\r\n${injectedLine}`);
    assert.throws(() => validateDataOnlySdp(hostile), P2PSdpError, injectedLine);
  }

  assert.throws(
    () => validateDataOnlySdp(valid.replace("a=sctp-port:5000", "a=max-message-size:65536")),
    P2PSdpError,
  );
  for (const invalidPort of ["0", "65536"]) {
    assert.throws(
      () => validateDataOnlySdp(valid.replace("m=application 9", `m=application ${invalidPort}`)),
      P2PSdpError,
    );
  }
});

test("numeric host ICE candidates are not relayed while mDNS and reflexive candidates remain", () => {
  const valid = [
    "v=0",
    "o=- 1 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=sctp-port:5000",
    "a=candidate:1 1 udp 2122260223 192.168.1.4 5000 typ host generation 0",
    "a=candidate:2 1 udp 2122260223 9f03b0d1-1234-4abc-8def-123456789abc.local 5001 typ host generation 0",
    "a=candidate:3 1 udp 1686052607 1.1.1.1 62000 typ srflx raddr 192.168.1.4 rport 5000",
    "",
  ].join("\r\n");
  const redacted = redactNumericHostCandidates(valid);
  assert.match(redacted, /^o=- 1 2 IN IP4 0\.0\.0\.0$/mu);
  assert.doesNotMatch(redacted, /127\.0\.0\.1/);
  assert.doesNotMatch(redacted, /192\.168\.1\.4 5000 typ host/);
  assert.match(redacted, /\.local 5001 typ host/);
  assert.match(redacted, /1\.1\.1\.1 62000 typ srflx/);
  assert.match(redacted, /raddr\s+0\.0\.0\.0 rport 9/);
  assert.equal(hasUsableIceCandidate(redacted), true);
  const connectionRedacted = redactNumericHostCandidates(
    valid.replace("c=IN IP4 0.0.0.0", "c=IN IP4 192.168.1.4"),
  );
  assert.match(connectionRedacted, /c=IN IP4 0\.0\.0\.0/);
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(valid.replace("c=IN IP4 0.0.0.0", "c=IN IP4 192.168.1.4")),
    P2PSdpError,
  );
  const portRedacted = redactNumericHostCandidates(
    valid.replace("m=application 9", "m=application 53123"),
  );
  assert.match(portRedacted, /m=application 9 UDP\/DTLS\/SCTP webrtc-datachannel/);
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(valid.replace("m=application 9", "m=application 53123")),
    P2PSdpError,
  );
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(valid),
    P2PSdpError,
  );
  assert.doesNotThrow(() => assertPrivacyPreservingRemoteSdp(redacted));
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(redacted.replace("rport 9", "rport 5000")),
    P2PSdpError,
  );
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(redacted.replace("1.1.1.1", "192.168.1.9")),
    P2PSdpError,
  );
  const sixToFourCandidate = redacted.replace("1.1.1.1", "2002:c0a8:0101::1");
  assert.doesNotMatch(redactNumericHostCandidates(sixToFourCandidate), /2002:c0a8:0101::1/);
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(sixToFourCandidate),
    P2PSdpError,
  );
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(`${redacted.trim()} raddr 192.168.1.4 rport 5000\r\n`),
    P2PSdpError,
  );
  assert.throws(
    () => assertPrivacyPreservingRemoteSdp(redacted.replace("a=sctp-port:5000", "a=remote-candidates:1 192.168.1.4 5000")),
    P2PSdpError,
  );
});

test("the room closes if WebRTC nevertheless surfaces an RTP track", async () => {
  const roomSource = await readFile(new URL("../src/components/p2p/LiveRoom.tsx", import.meta.url), "utf8");
  assert.match(roomSource, /connection\.ontrack/);
  assert.match(roomSource, /getTransceivers\(\)\.length !== 0/);
  assert.match(roomSource, /unsupported media/);
  assert.match(roomSource, /sendPreparedCloseLiveSession/);
  assert.match(roomSource, /purgeAttemptsRef\.current <= 3/);
});

test("new and changed devices are verified before direct negotiation and BFCache restore clears state", async () => {
  const [roomSource, inboxRoute, browserSource, middleware] = await Promise.all([
    readFile(new URL("../src/components/p2p/LiveRoom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/p2p/inbox/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/p2p/browser.ts", import.meta.url), "utf8"),
    readFile(new URL("../middleware.ts", import.meta.url), "utf8"),
  ]);
  assert.match(roomSource, /pendingNegotiationRef/);
  assert.match(roomSource, /No offer, ICE candidate gathering, remote SDP application, or answer/);
  assert.match(roomSource, /I compared all five groups/);
  assert.match(roomSource, /window\.addEventListener\("pageshow", pageShow\)/);
  assert.match(roomSource, /event\.persisted/);
  assert.match(inboxRoute, /state: "CREATED"/);
  assert.match(inboxRoute, /never carries an envelope/);
  assert.match(inboxRoute, /export async function POST/);
  assert.match(browserSource, /inboxSigningBytes\(input\)/);
  assert.doesNotMatch(browserSource, /\/api\/p2p\/inbox\?/);
  assert.match(middleware, /isEphemeralMessagingPath/);
  assert.match(middleware, /protectEphemeralMessagingResponse/);
});

test("the live composer disables browser writing-assistance uploads", async () => {
  const roomSource = await readFile(new URL("../src/components/p2p/LiveRoom.tsx", import.meta.url), "utf8");
  assert.match(roomSource, /spellCheck=\{false\}/);
  assert.match(roomSource, /autoCorrect="off"/);
  assert.match(roomSource, /autoCapitalize="off"/);
  assert.match(roomSource, /autoComplete="off"/);
});
