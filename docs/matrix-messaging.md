# Text-only encrypted messaging

> **Superseded for the current proof of concept.** Echo is implementing the
> live-only WebRTC design in `docs/live-p2p-messaging.md` so it does not need to
> operate a messaging homeserver. This document is retained as the evaluated
> path if offline delivery, durable history, or multi-device sync is required
> later. No Matrix infrastructure has been deployed.

This is a separate delivery track from Echo's feed and admin metrics. The old
Signal-style experiment stays disabled and its `/api/dm/*` routes stay gone;
Matrix rooms start fresh and no legacy ciphertext is migrated.

## Decision

Use a private Synapse homeserver with Matrix Authentication Service (MAS), not a
new bespoke cryptographic protocol. MAS is the current stable OAuth2/OIDC path
for greenfield Synapse deployments. Echo uses the Matrix JavaScript SDK with
Rust crypto, encrypted rooms, cross-signing, device verification, and key
backup.

Pinned initial components:

- Synapse `v1.159.0`:
  `ghcr.io/element-hq/synapse:v1.159.0@sha256:edf259d2b575b669a3e81024918ab8d5cfb7d2bfa5a53c9e09695f1abc5645cb`
- MAS `v1.21.0`:
  `ghcr.io/element-hq/matrix-authentication-service@sha256:73bb86fb8f412082829e603417b2df3e351bbda79bedaa46beb0f3f533bdcc1c`
- Postgres 17 under CloudNativePG, with Synapse and MAS in separate databases
  and roles.

Every version bump must pass the policy-module contract suite, two-client E2E
tests, image/SBOM scans, and a backup restore drill before rollout.

## Identity and authentication

GitHub's immutable numeric account ID is the identity anchor. The Matrix ID is
deterministic:

```text
@gh_<github-account-id>:<permanent-server-name>
```

The mutable GitHub login is display text only. MAS uses a separate GitHub OAuth
application, authorization-code flow, and S256 PKCE. The existing Echo OAuth
application cannot share its callback. Existing NextAuth sessions are not
exchanged for Matrix tokens; the first visit to Messaging performs a second
GitHub redirect, normally reusing the existing GitHub browser session.

Use one pre-registered public Echo OAuth client with an exact production
callback. Dynamic client registration and wildcard Vercel preview callbacks
stay disabled. Preview deployments keep messaging off; staging uses its own
client and exact callback.

Provision accounts lazily in v1. A user can receive invitations only after they
have opened Messaging once. Pre-provisioning via the privileged MAS Admin API is
out of scope until separately threat-modeled.

## Browser token and key boundary

- MAS issues five-minute access tokens and rotating, finite refresh tokens.
- Echo's server stores refresh tokens encrypted with versioned AES-256-GCM keys.
  Associated data binds the ciphertext to the Echo user, installation, Matrix
  device, and record version.
- The browser receives only the current short-lived access token, held in the
  Matrix provider closure. It is never written to local/session storage,
  NextAuth JWTs, URLs, logs, analytics, or rendered server-component data.
- Matrix crypto material uses its dedicated encrypted IndexedDB. One tab owns
  it at a time through `navigator.locks`; other tabs show a locked state.
- Users own their recovery phrase/key. Echo does not escrow recovery secrets.
- `OnlySignedDevicesIsolationMode` is mandatory. New devices recover or verify
  via SAS; camera/QR verification is not included.

The current nonce-based production CSP is a prerequisite. When Matrix is
enabled, `connect-src` gains exactly the chosen Matrix origin. `media-src` and
`object-src` remain `none`; only the Wasm capability proven necessary by the
pinned crypto SDK may be added.

## Room and message policy

Every DM is a private, local, two-member custom room with:

- `m.federate: false` at creation;
- `m.room.encryption` fixed to `m.megolm.v1.aes-sha2`;
- invite-only membership and joined history;
- exactly two local `@gh_[0-9]+` members;
- no aliases, guests, public listing, third-party invites, search, presence, or
  mutable encryption/power/history state.

A derived, scanned Synapse image contains a policy module that enforces those
properties and rejects plaintext persistent events. Echo revalidates the same
properties before every read and send.

Echo accepts only a successfully decrypted `m.room.message` whose original
content is exactly `{ msgtype: "m.text", body: string }`. It rejects formatted
HTML, relations, edits, replies, reactions, notices, emotes, stickers, calls,
files, thumbnails, URLs, email-like links, unknown keys, control characters,
and over-limit UTF-8. Messages render as React text nodes with no Markdown,
linkification, or previews. Clipboard files and drag/drop files are rejected.

Synapse's media repository and URL previews are disabled. Public ingress denies
all Matrix media API versions, federation/key APIs, and the Synapse/MAS admin
APIs. Request bodies are capped while allowing normal key uploads.

### Unavoidable E2EE limitation

The homeserver sees ciphertext, so it cannot prove that an encrypted payload is
text instead of an attachment descriptor produced by a malicious third-party
client. Echo will never render that content, and its media APIs make attachments
unusable, but “text only” is an enforced Echo-client policy rather than a
cryptographic statement about all possible Matrix clients.

## Echo implementation slices

1. **Foundation:** fail-closed server configuration, Matrix identity/session/
   auth-transaction/direct-room tables, token encryption and rotation tests,
   same-origin and rate-limit guards, and a server-only feature flag defaulting
   off.
2. **Authentication:** MAS OAuth2/PKCE start/callback/refresh/revoke provider,
   expected-MXID plus `/whoami` checks, replay-proof state transactions, and
   installation-scoped logout.
3. **Conversation service:** idempotent server-mediated room creation under a
   database lease, exact participant mapping, and hostile-room-state tests.
4. **Client crypto:** dynamically loaded Matrix provider under `/messages`, Rust
   crypto initialization, one-tab ownership, cross-signing, recovery, key
   backup, and SAS verification.
5. **Text UI:** conversation list, DM page, security setup, verification dialog,
   strict shared content validator, unsupported-event hiding, and no media UI.
6. **Adversarial verification:** two real SDK clients plus tests for plaintext/
   rich/media events, unsigned devices, identity reset, third members,
   encryption downgrade, token replay/rotation, second-tab exclusion, CSP/XSS,
   kill switch, and every denied ingress endpoint.

The composer remains disabled until configuration, session, local recovery,
room state, and peer identity checks are all ready.

## Kubernetes and operations

Deploy Synapse, MAS, the policy module, and CloudNativePG into a restricted
namespace with read-only roots, dropped capabilities, seccomp, default-deny
network policies, mounted secrets, private metrics, and no public admin port.
Expose only explicitly allowlisted Matrix client, OAuth, and human-login paths.

Back up both databases together with continuous WAL plus daily base backups to a
versioned Garage bucket and a 30-day recovery window. Separately back up the
Synapse signing/macaroon/form secrets, MAS encryption/signing keys, shared
secret, provider ID, OAuth secret, and immutable hostname configuration. Run an
isolated restore every month.

Prometheus alerts cover availability, 5xx rate, send latency, database/PVC
pressure, restarts, and backup age. Federation queues and media writes should
remain zero. Grafana is observational only; no Matrix admin token is placed in
Echo or a browser dashboard.

## Production gates and required owner input

Do not create the production homeserver until all of these are resolved:

1. Select an owned, durable `server_name` and public Matrix/MAS hostnames. A
   recommended layout is IDs on `echo.<owned-domain>`, Synapse at
   `matrix.echo.<owned-domain>`, and MAS at `auth.echo.<owned-domain>`. The
   `server_name` cannot be changed later.
2. Create the separate GitHub OAuth application after those hosts are fixed.
3. Confirm public DNS/TLS and ingress access. A tailnet-only endpoint cannot
   serve ordinary Vercel users; a `.ts.net` Funnel is acceptable for disposable
   staging, not the permanent identity without an explicit decision.
4. Provision and restore-test the Garage backup bucket before public canary.
5. Accept the encrypted-payload text-only limitation above.

### Current cluster readiness (2026-08-31)

The existing K3s cluster is not currently a safe Matrix target:

- its only node is under `DiskPressure` with a `NoSchedule` taint (about 87%
  root-disk use), while host CPU is saturated by work outside Kubernetes;
- only six system pods are running and twenty existing controllers/apps are
  pending after repeated ephemeral-storage evictions;
- 2,397 failed and 5,235 succeeded pod objects remain, but terminal-object
  cleanup alone will not reclaim the host data causing disk pressure;
- Traefik and the Tailscale operator exist, but there is no public ingress,
  cert-manager, CloudNativePG, durable/snapshot-capable storage, or live
  Prometheus stack;
- the default `local-path` storage is single-node, delete-on-release, and has no
  volume expansion or snapshot API, so it is suitable only for disposable
  staging unless external backup/restore is proven.

Cluster cleanup must be separately authorized because the largest disk users
and CPU consumers are unrelated host workloads. After recovery, wait for all
existing controllers to become ready before installing any Matrix component.

After those gates: deploy tailnet staging, run two-account adversarial tests,
deploy a one/two-account public canary with the Echo feature flag still off,
verify backup restore, then enable the flag gradually.

References: [Synapse MAS integration](https://github.com/element-hq/synapse/blob/develop/docs/upgrade.md#stable-integration-with-matrix-authentication-service),
[MAS homeserver setup](https://element-hq.github.io/matrix-authentication-service/setup/homeserver.html),
[MAS GitHub SSO](https://element-hq.github.io/matrix-authentication-service/setup/sso.html#github),
[Matrix E2EE](https://matrix.org/docs/matrix-concepts/end-to-end-encryption/),
[matrix-js-sdk E2EE](https://matrix-org.github.io/matrix-js-sdk/#end-to-end-encryption-support),
and [Synapse module callbacks](https://element-hq.github.io/synapse/latest/modules/third_party_rules_callbacks.html).
