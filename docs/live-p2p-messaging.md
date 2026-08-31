# Live-only encrypted text messaging

## Status and scope

This is Echo's current messaging proof of concept. It replaces the planned
Matrix deployment for this phase; Matrix remains a possible future option if
offline delivery, durable history, multi-device sync, or reliable relay becomes
a requirement.

The feature is deliberately narrow:

- two signed-in Echo users must have Messaging open at the same time;
- only UTF-8 text is accepted, with a 4 KiB limit per message;
- messages exist only in the two page processes and disappear on refresh,
  navigation, or disconnect;
- WebRTC `RTCDataChannel` carries message frames directly between browsers;
- Echo stores no message body, ciphertext, transcript, attachment, or receipt;
- camera, microphone, files, paste/drop uploads, rich text, previews, reactions,
  and push notifications are not supported.

There is intentionally no TURN relay in this proof. Some restrictive or
symmetric-NAT networks will therefore fail to connect instead of falling back
to a hosted message path.

## Trust and encryption model

Each browser origin creates two P-256 key pairs with Web Crypto:

- a non-extractable ECDSA private key authenticates signaling;
- a non-extractable ECDH private key encrypts signaling end to end.

The private keys are structured-cloned into IndexedDB and never serialized by
the application. Echo's database stores only the matching public keys and a
SHA-256 device fingerprint. The first connection to another user is trust on
first use (TOFU). Echo pins that user's fingerprint locally, displays a shared
safety code bound to both account and device identities, and blocks a changed
key until the user explicitly replaces the pin.

For a new or changed device, this is a verification-first flow: Echo exposes a
short-lived identity-only invitation with no SDP or ICE candidates. Each
browser requires either its own saved trusted pin or a full out-of-band safety
code comparison before it constructs or applies peer-connection details. A
saved trusted pin retains the fast path. The code is not secret; its value
comes from an independent comparison, not from clicking through the UI.

The browser signs the complete SDP offer or answer, including WebRTC's DTLS
fingerprint, before relaying it. The SDP and ICE candidates are encrypted with
AES-256-GCM under an ECDH/HKDF-derived, direction-specific key. The session,
participants, devices, fingerprints, direction, expiry, and offer/answer
relationship are authenticated as associated data. WebRTC then encrypts the
actual data channel with DTLS. The answer binds authenticated offer content,
not the malleable raw ECDSA signature encoding.

This model protects message content from Echo, Vercel, Supabase, and a passive
network observer. Its intentional limits are:

- a first-contact server key substitution is detectable only if the users
  compare the safety code out of band;
- a compromised Echo deployment can serve hostile JavaScript, as with any
  browser cryptography application;
- non-extractable keys reduce accidental export but do not defend against
  script already executing in the same origin;
- the durable ECDH device key means a later compromise of that private key can
  decrypt a captured, still-retained SDP/ICE envelope; it cannot recover a
  direct WebRTC data-channel transcript;
- the peer and the configured STUN provider can learn a user's IP and network
  addresses;
- encrypted database pages may remain in provider backups or WAL after logical
  deletion.

Echo's nonce CSP, same-origin mutation checks, strict schemas, React text-node
rendering, and disabled media permissions are part of the security boundary.
No plaintext fallback exists.

## Signaling and retained data

The existing Vercel application provides an authenticated, same-origin polling
mailbox. Reads are device-signed POSTs, so an Echo web-session cookie alone
cannot fetch encrypted envelopes. It is signaling infrastructure, not a
message service. It retains:

- one public-key device registration and short online-presence timestamp per
  user;
- at most one identity-only `CREATED` invitation per active peer pair, with no
  SDP, ICE candidate, or encrypted envelope;
- a server-generated session identifier and participant/device identifiers;
- at most one opaque encrypted offer and one opaque encrypted answer;
- creation and expiry timestamps.

The client requests immediate deletion of encrypted offer/answer rows when a
participant closes the session or the direct channel is established. If that
request cannot reach Echo, the rows remain inaccessible after their original
ten-minute expiry and are physically removed by the production minute-level
database job. Request paths use indexed expiry checks and do not run global
database cleanup work. A closed session retains only its
non-content metadata tombstone through that expiry for rate-limiting and
idempotency; it is never usable again.

Echo does not load Vercel Analytics or Speed Insights browser telemetry in this
release. Deployment-platform request logs can still observe that a browser
requested a messaging page or signaling endpoint; those logs receive neither
message text nor plaintext SDP/ICE.

Message pages and signaling responses are `private, no-store`. A page restored
from the browser back/forward cache explicitly clears its live session and
transcript before it can be used again.

The legacy Signal experiment is separate. Its `/api/dm/*` routes remain `410
Gone`; its existing tables are not read, migrated, or deleted by this feature.

## User-visible safety contract

Before a browser constructs a peer connection, the UI must state and require
explicit acceptance of all of the following:

1. both people must remain online with Messaging open;
2. messages disappear and cannot be recovered;
3. the peer and STUN provider may learn the user's IP and network addresses;
4. Echo relays encrypted connection metadata for no more than ten minutes;
5. direct connection can fail because no relay is provided.

Before the first direct network attempt with a new or changed device, the UI
also requires the user to compare the five-group safety code outside Echo and
explicitly confirm that comparison. Echo removes numeric host ICE candidates
from relayed SDP; it replaces ICE related-address values with RFC 8839 privacy
placeholders (`0.0.0.0`/`::` and port `9`), anonymizes the SDP origin, and
replaces identifying SDP connection lines and default media port before relay;
a receiver fails
closed if it receives identifying connection data, non-global numeric
candidates, unexpected hostnames, relay candidates, or remote-candidate
attributes. This reduces accidental local-network address disclosure and
blocks an authenticated peer from using SDP to direct numeric private-address
ICE probes, but does not make direct mode anonymous. mDNS host candidates stay
enabled for same-LAN compatibility, so an authenticated peer can still cause a
local `.local` lookup. A peer still learns the working public or mDNS candidate
needed to connect.

The composer stays disabled until the peer's signature and SDP are valid, the
fingerprint is trusted, and the data channel is open. Binary frames, unknown
fields, invalid UUIDs, control characters other than tab/newline, oversized
UTF-8, unexpected data channels, and abusive send rates fail closed.

## Origin and custom-domain migration

`https://echo-nine-xi.vercel.app` is acceptable for this disposable proof. The
browser identity and peer pins are scoped to that exact origin by IndexedDB.
Moving to a custom domain creates a fresh identity; the non-extractable private
key cannot be copied by the application. Users must expect a one-time identity
reset and re-verify safety codes after the move. From Messages, they must
explicitly confirm replacement of the prior browser device; that closes pending
signaling sessions and changes their fingerprint. The Vercel origin should not
be treated as a permanent cryptographic identity. A browser reset is not a
proof of cryptographic continuity: stronger recovery needs an existing-device
authorization or a separately protected recovery mechanism.

## Deployment and rollback

`P2P_MESSAGES_ENABLED` is a server-only kill switch and must equal the literal
string `true`. Missing or invalid configuration makes every messaging route
unavailable; there is no plaintext or legacy fallback.

Release order:

1. run all quality and repository security gates;
2. apply the additive Prisma migration;
3. install and verify the minute-level database expiry job;
4. deploy with the feature flag absent or false;
5. smoke-test authentication, fail-closed APIs, and expiry;
6. set the production flag to `true` and deploy again;
7. complete a two-account, two-browser safety-code and text exchange.

For emergency rollback, set the flag false first. Existing direct channels may
continue until either page closes because their traffic no longer traverses
Echo. Removing the signaling tables is a separate destructive change and is
not part of rollback.

## References

- [WebRTC peer connections, signaling, STUN, and TURN](https://webrtc.org/getting-started/peer-connections)
- [RFC 8827: WebRTC security architecture](https://www.rfc-editor.org/rfc/rfc8827.html)
- [RFC 8831: WebRTC data channels](https://www.rfc-editor.org/rfc/rfc8831.html)
- [RFC 8828: WebRTC IP address privacy](https://www.rfc-editor.org/rfc/rfc8828.html)
- [RFC 8839: ICE SDP and privacy placeholders](https://www.rfc-editor.org/rfc/rfc8839.html)
- [IndexedDB origin and storage model](https://www.w3.org/TR/IndexedDB/)
- [Cloudflare's public STUN service](https://developers.cloudflare.com/realtime/turn/)
