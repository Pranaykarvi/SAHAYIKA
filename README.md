# Sahayika

Sahayika connects rural Indian women organised in Self-Help Groups (SHGs) to economic opportunity — government procurement, institutional orders, training — through AI-assisted matching that is always verified by a professional social worker and always decided on by the group itself. The platform proposes; a social worker verifies against the cited source document; the group decides. The system holds no authority to commit a group to anything, and that ordering is enforced in the database, not just the interface.

## Repository layout

| Path | What it is |
| --- | --- |
| [`backend/`](backend/README.md) | Express 5 + TypeScript API. Owns all data (Supabase Postgres via Drizzle, under row-level security) and all business logic. |
| [`frontend/`](frontend/README.md) | Next.js 15 web application. Owns all presentation; has no database access of any kind. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the system works and why it is shaped this way — diagrams, data model, the match lifecycle, security model, and an honest account of limitations. |
| [`CLAUDE.md`](CLAUDE.md) | The project's invariants and working rules. |

The two applications deploy independently and share no code. They are linked only by a generated contract: the backend's validation schemas produce `backend/openapi.json`, from which the frontend generates its types. No backend shape is ever hand-written on the frontend.

## Getting started

Prerequisites: Node 22+, pnpm 10+, Docker. The exact command sequence — database, migrations, seeding, both dev servers — is in [ARCHITECTURE.md, section 11](ARCHITECTURE.md#11-running-it-locally), including the honest caveats about authentication setup. Each folder's README documents its own scripts and environment variables.

## Data

Every record in a seeded environment is synthetic demonstration data: flagged `is_synthetic` in the database, badged in the UI, and accompanied by a persistent demonstration banner. The invented opportunities name deliberately fictional issuing bodies and imitate no real tender, department, or officer.

## Status

This is a working demonstration build of the matching core, not a production system. All contract endpoints are implemented and tested; the full social-worker-to-bookkeeper path is covered by an end-to-end test. The financial-literacy tutor, capital gateway, inter-group lending, IVR/WhatsApp channels, native Android app, and real procurement-portal integration are deliberately out of scope for this build — see [ARCHITECTURE.md, sections 10 and 13](ARCHITECTURE.md#10-what-is-deliberately-not-built) for the scope boundary and known limitations. The full original design specification is preserved in this file's git history (`git show bd36fc4:README.md`).
