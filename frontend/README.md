# Sahayika frontend

Next.js 15 (App Router) web application. Owns all presentation; owns no data. Every piece of data arrives through the backend API via the generated client in `src/lib/api` — there is no database access, no Drizzle, no connection string, and no direct Supabase data query anywhere in this folder. Supabase is used only for authentication.

## What is implemented

- Auth: email/password sign-in against Supabase Auth, session refresh in middleware, role-based routing read from the backend (`GET /me`) — social workers and admins to `(dashboard)`, bookkeepers to `(group)`. There is no sign-up page; accounts are created by an administrator.
- The social-worker surface: overview, opportunity list/detail and a manual-entry form that mirrors the backend's citation rules for immediate feedback (the server validates independently), the verification queue, the verification screen (summary fields with their citations at equal visual weight, group profile and ledger position, readiness factors with override, ranking reasons, and the hard-filter eliminations), group pages with consent controls, and a match-distribution chart that flags over-concentration.
- The bookkeeper surface, designed for a shared phone at 360px: editable capability profile (saving re-embeds on the backend), verified matches only — with obligations shown at the same weight as the opportunity, plain-language match reasons, accept/decline with a no-external-commitment confirmation, and a Web Speech readout button (a stand-in for the voice interface in the full design) — and an append-only ledger with running balance and reversal-only corrections. No edit or delete control exists anywhere on the ledger.
- Sample-data handling: every synthetic record renders a SAMPLE DATA badge that cannot be disabled, and a persistent banner marks the build as a demonstration whenever synthetic data is visible.
- A typed API client over the generated schema: Bearer token attachment, the standard error shape converted to a typed `ApiError` rendered as a readable message, and retries for idempotent GETs only — writes are never replayed.

## What is not implemented

Deliberately out of scope for this build, not deleted from the design: the financial-literacy tutor, the capital-access gateway, the IVR voice channel, and the Android app. The text-to-speech button on the group surface is a browser stand-in, not the specified voice interface.

## Data

Everything visible in a seeded environment is synthetic demonstration data, flagged by the backend and badged in the UI. No real group, tender, or person appears.

## Setup

```sh
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev                     # listens on port 3000; expects the backend on 4000
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Run and build |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | The full check |
| `pnpm api:generate` | Regenerate `src/lib/api/schema.d.ts` from `../backend/openapi.json` (deterministic). Never hand-write a type that duplicates a backend shape — regenerate instead |
| `pnpm test:e2e` | Playwright flow across both roles; expects both apps running and a seeded database |

## Layout

```
src/
  app/(dashboard)/   social-worker surface
  app/(group)/       bookkeeper surface
  app/login/
  lib/api/           generated schema + typed fetch wrapper (browser/server)
  lib/auth/          Supabase browser/server clients, middleware, sign-out
  components/        shared UI (shadcn/ui, neutral base colour)
e2e/                 Playwright end-to-end test
```
