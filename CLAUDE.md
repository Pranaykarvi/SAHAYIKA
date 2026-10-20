# Sahayika — project rules

## What this is
A platform for connecting rural Indian women in Self-Help Groups to economic
opportunity through AI-assisted matching that is always verified by a professional
social worker and always decided on by the group itself. Two applications:
backend/ owns all data and logic, frontend/ owns all presentation.

## Invariants — never violate these
1. No match is ever shown to a group without a VerificationRecord approving it.
   Enforced in the database, then the service layer, then the UI. All three.
2. No automated output is final anywhere. Every score, band, and summary is a
   recommendation a human can override, and every override records a reason.
3. Every match carries a non-null `reasons` field in plain language. A match that
   cannot explain itself is a bug, not a degraded result.
4. Capability profiles and matches are group-level, never individual-level.
5. Location is stored at village granularity. No GPS coordinates, no addresses.
6. No biometric data and no government ID numbers, in any table, ever.
7. Every seeded or synthetic record is flagged in the database and badged in the UI.
   Nothing fabricated may look real.

## Boundary rules
- The frontend never touches the database. No Drizzle, no connection string, no
  direct Supabase data queries. Only the generated API client.
- The backend never renders HTML or knows about React. It returns JSON.
- Zod schemas in backend/src/validation are the single source of truth for every
  shape crossing the API boundary. The OpenAPI document is generated from them, and
  the frontend's types are generated from that document. Never hand-write a type on
  the frontend that duplicates a backend shape.
- services/ contains no Express types. A service function takes plain arguments and
  returns plain data, so it is testable without HTTP.

## Code rules
- TypeScript strict in both folders. No `any`. No non-null assertions except on
  values a type guard has already narrowed.
- Every route validates its input with a Zod schema before calling a service.
- No raw SQL except in migrations and the pgvector similarity query, which must be
  a single named, commented function.
- No AI vendor name appears anywhere outside backend/src/lib/ai/providers/.
- Frontend: server components by default. "use client" only where interactivity
  requires it.

## Process rules
- Do not create markdown files to document your own work. No PLAN.md, no NOTES.md,
  no SUMMARY.md, no stage reports. This CLAUDE.md and the three README files are the
  only markdown in this repository. Explain things in code comments or in chat.
- Do not install a package without saying why in chat first.
- Before calling any stage done, run the full check in whichever folder you touched:
  `pnpm typecheck && pnpm lint && pnpm test`. If it fails, the stage is not done.
- Do not write code for a later stage. Stub it with a typed function that throws
  `new Error("not implemented: stage N")`.
- Keep functions small enough to read without scrolling.
