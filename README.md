# Echo — Minimal Twitter-like UI

A Next.js App Router project that mimics a lightweight Twitter experience: compose “echoes”, like, repost, mention users, and browse profiles — all styled with Tailwind and authenticated via GitHub OAuth using NextAuth.

This repo contains the web app under `web/` and a minimal root setup for docs and tooling.

## Features

- **Splash sign-on:** Unauthenticated visitors to `/` see a splash page with a single “Sign in with GitHub” button. Protected routes redirect to the splash and return you to your original page after login.
- **GitHub Auth:** NextAuth with GitHub OAuth. Username is derived from your GitHub login.
- **First-time setup:** After login, a cookie `echo_setup=done` is set via `/setup` before allowing full access.
- **Home feed:** Compose new echoes, like/unlike, repost/unrepost, and share via the Web Share API or clipboard fallback.
- **Mentions → profiles:** `@username` in text and the echo header handle link to that user’s profile.
- **Profiles:** Dynamic route at `/profile/[user]` with tabs for Echoes and Likes. Includes a compact header with avatar and an editable bio (stored locally).
- **Local state:** Echoes and bios persist in `localStorage` during development. There is no backend database yet.
- **Toasts:** Simple in-app notifications.

## Tech Stack

- `Next.js 15` (App Router) + `React 19`
- `TypeScript`
- `Tailwind CSS v4`
- `next-auth` (GitHub provider)

## Repo Layout

- `web/` — Next.js app
  - `src/app/page.tsx` — Splash or Home feed (depending on auth)
  - `src/app/profile/[user]/page.tsx` — Dynamic profile route with Echoes/Likes tabs
  - `src/app/login/page.tsx` — Redirects to `/` (splash sign-on)
  - `middleware.ts` — Auth gating and setup redirect
  - `src/components/` — UI components (Feed, Echo, Sidebar, Splash, etc.)
  - `src/state/` — Client state for echoes and profiles (localStorage)

## Getting Started

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
  - `AUTH_SECRET` — any random secret (use `openssl rand -base64 32`)
  - `AUTH_GITHUB_ID` — your GitHub OAuth Client ID
  - `AUTH_GITHUB_SECRET` — your GitHub OAuth Client Secret
  - `DATABASE_URL` — Supabase Postgres connection string

Important: Prisma reads DATABASE_URL from `web/.env` (not `.env.local`) when running CLI commands like `prisma migrate`. Create `web/.env` with the same `DATABASE_URL` value or export it inline when running Prisma.

5) (First time) Initialize Prisma

- From `web/`:
  - `npm run prisma:generate`
  - Ensure `web/.env` contains `DATABASE_URL=...` (or run the next command with `DATABASE_URL=...` inline)
  - `npm run prisma:migrate -- -n init`

If you accidentally named it `DATABASE_URI`:
- Either rename it to `DATABASE_URL`, or add both keys in your env files:
  - `DATABASE_URI=...`
  - `DATABASE_URL=...` (Prisma requires this exact name)

6) Run the app

- `npm run dev` (in `web/`), then open `http://localhost:3000`

## Current Behavior Details

- Visiting `/` while signed out shows the splash. Clicking “Sign in with GitHub” starts OAuth. After sign-in (and setup), you land on Home.
- Protected routes (e.g., `/profile/[user]`) redirect to `/?callbackUrl=...` when signed out. After signing in, you return to the original page.
- Mentions like `@alice` link to `/profile/alice`. Tabs retain the user via `?tab=echoes|likes`.
- Profile bio is editable only on your own profile and is saved to `localStorage`.

## Environment Variables

All env vars are read from `web/.env.local` during development.

- `AUTH_SECRET` — NextAuth secret
- `AUTH_GITHUB_ID` — GitHub OAuth Client ID
- `AUTH_GITHUB_SECRET` — GitHub OAuth Client Secret
- `AUTH_TRUST_HOST=true` — helpful for local dev

Never commit real secrets. Use the provided `.gitignore` rules and keep `.env.local` out of version control.

## Next Steps (Suggested)

- **Wire to DB (in progress):** We’ve added Prisma + schema for Supabase. Next steps are to: add Prisma Adapter to NextAuth, implement API routes for echoes/likes/bio, and swap the UI from local state to server-backed data with optimistic updates.
- **Mentions/hashtags:** Linkify `#hashtags` and add a basic search/explore page.
- **Repost model:** Track reposter relationships and aggregate stats server-side.
- **Media uploads:** Support image/video attachments in echoes.
- **Notifications:** Basic notifications for mentions and likes.
- **Validation & limits:** Character limits, input validation, and better counters for compose/bio.
- **Tests & DX:** Add unit/integration tests and CI checks.

## Notes & Limitations

- Data is client-side only and persists via `localStorage` during development; it is not multi-user persistent.
- `web/.env.example` contains sample values — do not use them in production.
- Remote images allowed for GitHub avatars and DiceBear via `next.config.ts`.

---

Questions or want me to wire up a minimal backend to persist echoes and bios? Happy to help.
