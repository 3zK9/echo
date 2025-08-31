# Echo — Minimal Twitter‑like App

A Next.js App Router app that mimics a lightweight Twitter experience: compose “echoes”, like, repost, mention users, and browse profiles — styled with Tailwind and authenticated via GitHub OAuth (NextAuth). Data is persisted in Postgres via Prisma, and the UI uses SWR with infinite scrolling, optimistic updates, and background prefetching.

The app lives under `web//`.

## Features

- Splash sign‑on: unauthenticated visitors to `/` see a splash page (NextAuth GitHub sign‑in).
- Auth: NextAuth (JWT session strategy) + Prisma adapter. Username is derived from your GitHub login.
- First‑time setup: `/setup` route handler sets a cookie (`echo_setup=done`) then redirects.
- Global Home feed: paginated (cursor), SWR infinite scrolling, optimistic create/like/repost, and background revalidation.
- Mentions → profiles: `@username` links to `/profile/[username]`.
- Profiles: `/profile/[user]` with Echoes/Likes tabs, infinite scroll, cached tab switching, and background prefetch. Echoes tab shows both originals and your reposts. Likes tab excludes reposts.
- Bio + Link: editable (bio 280 chars) with counters; server‑persisted via Prisma.
- Mobile UX: bottom navigation (Home, Compose, Profile menu). Profile menu includes a confirm‑on‑sign‑out.
- Prefetch: profile lists + meta prefetch on hover; app prewarms your own profile after sign‑in.
- Security: route gating via middleware (JWT or NextAuth session cookie), CSP headers, mutation origin checks, and safe link normalization.
- Toasts + confirm dialogs for key actions.

## Tech Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- NextAuth (GitHub provider) — JWT session strategy
- Prisma + Postgres (Supabase‑friendly) with pooled connections in prod
- SWR (infinite scroll, background revalidation)

## Repo Layout (web/)

- `src/app/page.tsx` — Home (uses `HomeFeed`)
- `src/app/profile/[user]/page.tsx` — Profile shell (client `ProfileView` manages tabs + URL)
- `src/app/setup/route.ts` — Sets setup cookies then redirects to `/`
- `src/app/api/*` — App Router API routes (echoes, likes, repost, profile)
- `middleware.ts` — Auth gating: allows `/`, `/api/auth/*`, etc. Uses JWT or session cookie
- `src/components/`
  - `HomeFeed.tsx` — SWR infinite home feed + Compose
  - `ProfileFeed.tsx` — SWR infinite Echoes/Likes with prefetch + infinite scroll
  - `ProfileHeader.tsx` — Avatar, bio/link editor with counters
  - `Echo.tsx` / `EchoList.tsx` — Echo component + list (optimistic like/repost)
  - `BottomNav.tsx` — Mobile nav with Profile menu + confirm sign out
  - `Confirm.tsx` / `Toast.tsx` — dialog + toast providers
- `src/lib/`
  - `db.ts` — Prisma client singleton
  - `security.ts` — mutation origin checks
  - `swr.ts` — SWR config + fetcher
  - `keys.ts` — SWR cache keys
- `prisma/` — Prisma schema + committed migrations

## Getting Started (Local)

1) Install dependencies

- `cd web && npm install`

2) Create a GitHub OAuth app

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

3) Create a Supabase project (Postgres)

- In Supabase, create a new project and get the `Connection string` (use the pooled connection for serverless if available).
- Copy the URL as your `DATABASE_URL`.

4) Configure environment

- Copy `web/.env.example` to `web/.env.local` and fill in:
  - `NEXTAUTH_SECRET` — random secret (or `AUTH_SECRET`, the code supports both)
  - `AUTH_GITHUB_ID` — GitHub OAuth Client ID
  - `AUTH_GITHUB_SECRET` — GitHub OAuth Client Secret
  - `AUTH_TRUST_HOST=true`
  - `DATABASE_URL` — your local Postgres (or Supabase) connection string

Important: Prisma CLI reads from `web/.env`. Create `web/.env` with at least `DATABASE_URL=...` (and optionally `DIRECT_URL=...`).

5) (First time) Initialize Prisma

- From `web/`:
  - `npm run prisma:generate`
  - Ensure `web/.env` contains `DATABASE_URL=...`
  - `npm run prisma:migrate -- -n init`

If you accidentally named it `DATABASE_URI`:
- Either rename it to `DATABASE_URL`, or add both keys in your env files:
  - `DATABASE_URI=...`
  - `DATABASE_URL=...` (Prisma requires this exact name)

6) Run the app

- `npm run dev` (in `web/`), then open `http://localhost:3000`

## Behavior Details

- Visiting `/` while signed out shows the splash. Clicking “Sign in with GitHub” starts OAuth. After sign-in (and setup), you land on Home.
- Protected routes (e.g., `/profile/[user]`) redirect to `/?callbackUrl=...` when signed out. After signing in, you return to the original page.
- Mentions like `@alice` link to `/profile/alice`. Tabs retain the user via `?tab=echoes|likes`.
- Profile bio/link are editable only on your own profile and persist to the database.
- Home feed is global (all users). Profile Echoes show originals and your reposts; Likes exclude reposts.
- SWR infinite scrolling for Home and Profile. Optimistic like/repost/create with rollback on error.

## Environment Variables

Local (web/.env.local)
- `NEXTAUTH_SECRET` (or `AUTH_SECRET`) — NextAuth secret
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- `AUTH_TRUST_HOST=true`
- `DATABASE_URL` — your Postgres URL (in `web/.env` for Prisma CLI)

Production (Vercel → Project → Settings → Environment Variables)
- `NEXTAUTH_URL=https://your-domain.tld`
- `NEXTAUTH_SECRET` and `AUTH_SECRET` — set both to the same value
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- `AUTH_TRUST_HOST=true`
- `DATABASE_URL` — pooled PgBouncer URL (6543) with `pgbouncer=true&connection_limit=1`
- `DIRECT_URL` — direct URL (5432) for Prisma migrations

Never commit real secrets. Use the provided `.gitignore` rules and keep `.env.local` out of version control.

## Next Steps / Feature Ideas

- Personalized Home feed (following). Add Follows model + queries and a follow UI.
- Hashtags and search (linkify `#tag`, simple search page, trending topics service).
- Media uploads (images/video) with signed uploads (e.g., S3) and previews.
- Notifications (mentions, likes, reposts) with a bell menu and badge counts.
- Rate limiting and abuse protection on POST routes.
- Better error surfaces + toasts + retry on transient errors.
- Delete echo confirm (exists) + undo window (optimistic restore).
- A11y polish: focus states, ARIA on menus/dialogs, keyboard nav.
- SEO/OG tags for profiles, canonical site URL config.
- Tighten CSP with nonces/hashes once stable.
- Tests: unit tests for utils/mapping and API route tests; simple Playwright flows.

## Notes & Limitations

- Remote images are allowed for GitHub avatars and DiceBear via `next.config.ts`.
- Vercel caching requires explicit `prisma generate` in the build (handled in `vercel.json`).
- Route handlers in Next 15 accept `{ params: Promise<...> }` — see API files for the current typing pattern.

---

Questions or want me to wire up a minimal backend to persist echoes and bios? Happy to help.

## Deploy to Vercel

- Root Directory: `web/`
- vercel.json build steps:
  - `npm run prisma:generate && if [ "$VERCEL_ENV" = "production" ]; then npm run prisma:deploy; fi && npm run build`
- Install Command: `npm ci`

Environment (Production): see “Environment Variables” above.

GitHub OAuth (prod):
- Homepage: `https://your-domain.tld`
- Callback: `https://your-domain.tld/api/auth/callback/github`

Troubleshooting (prod):
- Blank page → likely CSP: ensure `script-src 'unsafe-inline' 'unsafe-eval' blob:` present in `next.config.ts` headers.
- Prisma client error on Vercel → ensure `prisma generate` runs in build (vercel.json).
- Auth redirect loop → check `NEXTAUTH_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET` and that GitHub OAuth callback matches domain.
- If you switched from DB sessions to JWT, sign out/in to refresh cookies.
