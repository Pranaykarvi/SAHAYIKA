# Sahayika backend

Express 5 + TypeScript API. Owns all data (Supabase Postgres via Drizzle ORM) and all business logic; returns JSON only. The Supabase client is used solely for auth token verification — data access always goes through Drizzle, under row-level security.

## What is implemented

- Schema and migrations for groups, members, capability profiles, opportunities, matches, verification records, group decisions, an append-only ledger, and match eliminations. Invariant 1 (no match reaches a group without an approved verification) is enforced three ways: a database trigger, row-level security read policies, and a status filter hardcoded in the service layer.
- Auth: Supabase JWT verification against the project JWKS, role middleware, and RLS policies keyed to a per-request user context. The API role cannot bypass RLS.
- AI-assisted opportunity ingestion behind a vendor-neutral provider interface (`src/lib/ai`). Extraction must produce a fully cited summary — every non-null field quotes its source page and text — or the opportunity is stored with `needs_manual_entry = true` and no summary. Provider calls time out and fail closed. No vendor name appears outside `src/lib/ai/providers/`.
- The matching pipeline (`src/lib/matching`): pgvector retrieval (the one raw SQL query outside migrations), hard feasibility filters with persisted eliminations, rule-based readiness banding, and a weighted ranking where every signal writes a plain-language reason. Matching writes `proposed` matches and nothing else.
- Verification, readiness overrides (the original band is never overwritten), group decisions (which exercise the database guard), ledger with running balance and reversal-only corrections, consent suspension/revocation (revoking also clears the profile embedding), and distribution/overview reports.
- Structured audit logging (pino) for every verification decision, group decision, override, and consent change, with a request id on every log line.
- Hardening: helmet, per-user rate limits on `/opportunities/ingest` and `/matching/run`, a central error handler that never leaks stack traces or database errors.

## What is not implemented

Deliberately out of scope for this build, not deleted from the design: the financial-literacy tutor, the capital-access gateway, the IVR voice channel, and the Android app. The design specification for these is preserved in the root README's git history. Opportunity ingestion from real government portals is also out of scope — documents arrive by paste or manual entry, and every synthetic opportunity names an obviously fictional issuing body.

## Data

`pnpm db:seed` loads a synthetic demonstration dataset: one fictional federation, twelve groups, ledgers with deliberately varied discipline, and twenty invented opportunities. Every seeded record sets `is_synthetic = true`; the frontend badges them and shows a demonstration banner whenever they are present. Nothing in the seed imitates a real tender, department, or person.

## Setup

```sh
pnpm install
cp .env.example .env   # fill in values; see the comments in that file
pnpm db:migrate        # uses ADMIN_DATABASE_URL (table owner)
pnpm db:seed
pnpm dev               # listens on port 4000
```

`DATABASE_URL` must be the RLS-constrained role (`sahayika_app`), never the table owner. For local development without a Supabase project, token verification can point at any JWKS-serving endpoint via `SUPABASE_URL`; the integration tests show the pattern. AI providers are selected by env (`AI_EXTRACTION_PROVIDER`, `AI_EMBEDDING_PROVIDER`); the `fake` provider works offline for development and tests and fabricates nothing.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Run the API with reload |
| `pnpm build` / `pnpm start` | Bundle and run |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | The full check; integration tests self-skip without `ADMIN_DATABASE_URL` and `DATABASE_URL` |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations (checked in) |
| `pnpm db:seed` | Idempotent synthetic dataset |
| `pnpm openapi:generate` | Regenerate `openapi.json` from the Zod schemas — the contract the frontend builds against |

## Layout

```
src/
  routes/         Express routers, one file per resource
  controllers/    thin: validate with Zod, call a service, respond
  services/       business logic, no Express types
  db/schema/      Drizzle tables; db/migrations/ checked-in SQL (incl. RLS)
  lib/ai/         provider interface; vendor code only under providers/
  lib/matching/   retrieve, filter, readiness, rank
  lib/auth/       JWT verification, role and group-access middleware
  validation/     Zod schemas — the source of truth for every API shape
  seed/           synthetic fixtures and the idempotent seed runner
```
