# Sahayika — Architecture

This document describes the system as it exists in this repository, verified against the code in October 2026. Where a component is specified in the original design but not built, that is stated in place. Components marked "not built" are scope decisions, not omissions discovered later; see section 10.

## 1. What this is

Rural Indian women organised in Self-Help Groups (SHGs) reliably build savings discipline, collective creditworthiness, and vocational skill. What the SHG model does not reliably build is connection: a group that can stitch school uniforms to specification has no practical link to the school board two districts away that buys uniforms every year. Tenders are published in English on portals nobody in the village reads, and institutional buyers have no way to discover that a capable group exists within delivery distance. The capability is real; the demand is real; the gap between them is informational and geographic.

Sahayika is a matching platform that closes that specific gap and nothing more. It records what each group can actually produce, ingests opportunity documents (tenders, institutional orders), and uses semantic search plus hard feasibility rules to propose matches between groups and opportunities. Every proposal carries a plain-language explanation of why it was made, and every candidate that was eliminated is recorded with the reason, so the people using the system can see and challenge its judgement rather than trust it.

The one non-negotiable rule is the order of authority: the platform proposes, a professional social worker verifies, and the group itself decides. No match is ever visible to a group until a social worker has reviewed it against the cited source document and recorded an approval with a written rationale. When a group accepts a match, the system records the group's own decision and nothing else — the platform holds no authority to commit a group to any contract, order, or obligation to any outside party, and the API response for a decision carries a field stating exactly that.

## 2. How it works, in plain language

A tender document arrives — pasted in by a social worker, or typed in field by field from a paper copy. The system reads it and produces a structured summary: what is being bought, how many, by when, on what payment terms, with what penalties. Every statement in that summary must quote the exact sentence of the document it came from, with a page number. If any required fact cannot be quoted — if the payment terms are missing, or the deadline is ambiguous — the whole summary is rejected and the opportunity is set aside for a person to enter by hand. A half-right summary is treated as worse than none, because a summary that silently drops a penalty clause exposes a group with no legal support to real contractual risk.

The social worker then asks the system to find candidate groups. It searches group capability profiles for ones whose work resembles what the tender asks for, then applies hard rules: a group whose monthly capacity is below the order quantity is removed, not demoted; so is a group whose delivery distance is too far, or whose minimum production lead time does not fit the deadline. The groups that were removed are kept on a list with the reason each was removed, because a social worker who disagrees with a removal needs to be able to see that it happened. The survivors are ranked, and every factor that moved a group's rank is written down as an ordinary sentence.

Each proposed match then waits in a queue. The social worker opens it and sees the tender summary side by side with its quoted sources, the group's profile, its savings ledger position, and a readiness assessment — a coarse band (ready, stretch, not ready) with the three factors behind it, which the social worker can override by recording a reason. The original assessment is never erased; the disagreement stays visible. The social worker approves, rejects, or asks for more information, and must write at least a sentence of rationale either way.

Only an approved match ever reaches the group. The elected bookkeeper, on a shared phone passed around a meeting, sees the opportunity with its obligations — quantity, deadline, penalties — printed as loudly as its upside, hears it read aloud if the group prefers, and records the group's decision: accept or decline. Accepting creates no commitment to anyone outside the platform; it records that the group, having discussed it, said yes. The social worker sees that decision, with the name of the person who recorded it, and takes the connection forward outside the system. Alongside all of this, the bookkeeper keeps the group's savings ledger in the same app: entries can be added and corrected, but never edited or deleted — a correction is a new entry that reverses an old one, so the book never lies about what was once recorded.

## 3. System architecture

```mermaid
flowchart LR
    subgraph clients["Client surfaces"]
        SW["Social worker dashboard<br/>frontend/src/app/(dashboard)"]
        BK["Bookkeeper group surface<br/>frontend/src/app/(group)"]
    end

    subgraph fe["frontend/ — Next.js 15"]
        MW["Route middleware<br/>src/middleware.ts"]
        API_CLIENT["Typed API client<br/>src/lib/api"]
    end

    subgraph be["backend/ — Express 5"]
        ROUTES["routes/ + controllers/"]
        SERVICES["services/"]
        MATCHING["lib/matching/"]
        AI["lib/ai/ adapter boundary"]
        PROVIDERS["lib/ai/providers/<br/>vendor code lives only here"]
    end

    subgraph db["Supabase Postgres"]
        PG["tables + RLS policies<br/>+ triggers + pgvector"]
    end

    AUTH["Supabase Auth<br/>JWT issuer"]

    SW --> MW
    BK --> MW
    MW --> API_CLIENT
    API_CLIENT -->|"generated OpenAPI contract"| ROUTES
    ROUTES --> SERVICES
    SERVICES --> MATCHING
    SERVICES -->|Drizzle ORM| PG
    MATCHING -->|"one raw pgvector query"| PG
    SERVICES --> AI
    AI --> PROVIDERS
    MW -.->|"verify session"| AUTH
    ROUTES -.->|"verify JWT via JWKS"| AUTH
```

The repository holds two applications that deploy independently and share no code. The backend owns every byte of data and every rule; the frontend owns every pixel and nothing else. They are linked only by a generated contract: the backend's Zod validation schemas generate `backend/openapi.json`, and the frontend generates `src/lib/api/schema.d.ts` from that file. No type describing a backend shape is ever hand-written on the frontend.

What this buys: the backend can be tested, audited, and replaced without touching presentation; the frontend can be rebuilt (or joined by other clients — an IVR system, an Android app) against the same contract; and drift between the two is caught mechanically, because a stale contract fails type-checking rather than failing in production. What it costs: a regeneration step on every API change (two commands), some response-shape ceremony (new fields must be added to a Zod schema before a page can use them), and the discipline of never reaching around the contract — a temptation this codebase avoids by giving the frontend no database driver at all.

## 4. The match lifecycle

```mermaid
stateDiagram-v2
    [*] --> proposed: matching pipeline (social worker runs it; DB accepts only this status from the pipeline)
    proposed --> verified: social worker approves with rationale of 10+ chars (unique verification per match)
    proposed --> rejected: social worker rejects with rationale
    proposed --> proposed: needs_information recorded; status does not move
    verified --> presented: decision flow begins; DB TRIGGER requires an approved verification_record
    presented --> accepted: bookkeeper records the group's acceptance
    presented --> declined: bookkeeper records the group's refusal
    accepted --> completed: delivery recorded (seeded history only; no endpoint moves a match here yet)
    rejected --> [*]
    declined --> [*]
    completed --> [*]
```

Who can trigger what: the pipeline (run by a social worker or admin) creates matches, always `proposed` — the service hardcodes the status at the insert (`backend/src/services/matching.ts:244-252`). Verification transitions (`proposed → verified/rejected`) are social-worker actions through `POST /matches/:id/verify`; the database enforces one verification per match with a unique constraint on `verification_records.match_id` and a CHECK that the rationale is at least ten characters. The decision flow (`verified → presented → accepted/declined`) is a bookkeeper action through `POST /matches/:id/decision`; a dedicated RLS policy (migration 0006) permits a bookkeeper to update only their own group's matches, and only between exactly those statuses. No endpoint currently moves a match to `completed`; the four completed matches in the seed are historical fixtures with their own verification and decision records.

The transition to `presented` is guarded in Postgres itself, by this trigger (quoted from `backend/src/db/migrations/0000_faulty_ben_urich.sql:142-159`):

```sql
CREATE FUNCTION matches_require_approved_verification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'presented'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'presented')
     AND NOT EXISTS (
       SELECT 1 FROM verification_records vr
       WHERE vr.match_id = NEW.id AND vr.decision = 'approved'
     )
  THEN
    RAISE EXCEPTION 'invariant 1: match % cannot become presented without an approved verification_record', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER matches_verification_guard
BEFORE INSERT OR UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION matches_require_approved_verification();
```

This guarantee lives in Postgres rather than in application code because application code is bypassable: a future endpoint, a background job, a migration script, or a developer with a psql prompt can all write to the table without passing through the service layer. The claim "no group ever sees an unverified match" is the project's central promise, and a promise enforced only in a route handler is a convention, not a guarantee. The trigger is the floor no code path can go under; the service-layer status filter and the row-level security read policy (which hides anything earlier than `verified` from bookkeepers entirely) are the second and third layers above it.

## 5. Request lifecycle

One complete path, from a document arriving to a group deciding:

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js (middleware + pages)
    participant E as Express (routes/controllers)
    participant S as services/
    participant D as Drizzle
    participant P as Postgres (RLS + triggers)
    participant A as AI provider (via lib/ai)

    B->>N: POST ingest form (social worker)
    N->>E: POST /api/v1/opportunities/ingest (Bearer JWT)
    E->>E: verify JWT, load profile, rate limit
    E->>S: ingestOpportunityDocument()
    S->>A: extractStructured(document, summarySchema)
    A-->>S: cited summary, or failure (timeout / uncited field)
    S->>A: embed(canonical rendering)
    S->>D: insert opportunity (summary or needs_manual_entry)
    D->>P: INSERT with app.current_user_id set
    P-->>B: 201 opportunity

    B->>E: POST /api/v1/matching/run
    E->>S: runMatching()
    S->>D: raw pgvector retrieval (consent-filtered)
    S->>S: hard filters, readiness, ranking
    S->>D: insert proposed matches + eliminations
    P-->>B: 201 ranked matches, each with reasons

    B->>E: POST /api/v1/matches/:id/verify (rationale)
    S->>D: insert verification_record, status to verified
    P-->>B: 201 verification record (audit-logged)

    B->>E: POST /api/v1/matches/:id/decision (bookkeeper)
    S->>D: UPDATE status to presented
    P->>P: trigger checks approved verification exists
    S->>D: insert group_decision, status to accepted
    P-->>B: 201 decision, createsExternalCommitment false
```

Two details matter here. First, the AI calls happen outside any database transaction, so a slow provider never holds a connection; a failed extraction writes a `needs_manual_entry` row with no summary rather than a partial one. Second, every service call runs inside `runAsUser()` (`backend/src/db/client.ts:44-56`), which opens a transaction and sets `app.current_user_id` so the RLS policies can see who is asking — the connection role itself has no bypass.

## 6. Data model

```mermaid
erDiagram
    self_help_groups ||--o{ members : has
    self_help_groups ||--o| capability_profiles : "one profile"
    self_help_groups ||--o{ matches : receives
    self_help_groups ||--o{ ledger_entries : keeps
    self_help_groups ||--o{ match_eliminations : "was eliminated"
    opportunities ||--o{ matches : generates
    opportunities ||--o{ match_eliminations : "filtered for"
    matches ||--o| verification_records : "one verification"
    matches ||--o| group_decisions : "one decision"
    ledger_entries ||--o| ledger_entries : reverses
    user_profiles }o--|| self_help_groups : "bookkeeper belongs to"

    self_help_groups {
        uuid id PK
        text name
        uuid federation_id
        text village
        text district
        text state
        date formed_on
        uuid bookkeeper_member_id
        enum consent_status
        boolean is_synthetic
        timestamptz created_at
        timestamptz updated_at
    }
    members {
        uuid id PK
        uuid group_id FK
        text name
        text phone
        text preferred_language
        date joined_on
        boolean is_synthetic
    }
    capability_profiles {
        uuid id PK
        uuid group_id FK "UNIQUE"
        textArray skills
        jsonb certifications
        jsonb capacity
        textArray equipment
        vector embedding "1536 dims, nullable"
        timestamptz embedding_updated_at
        timestamptz updated_at
        boolean is_synthetic
    }
    opportunities {
        uuid id PK
        enum source
        text title
        jsonb summary "cited, nullable"
        text document_ref
        date deadline
        enum size_class
        vector embedding
        boolean needs_manual_entry
        boolean is_synthetic
        timestamptz created_at
    }
    matches {
        uuid id PK
        uuid group_id FK
        uuid opportunity_id FK
        numeric score
        jsonb reasons "NOT NULL"
        enum readiness_band
        enum readiness_override
        text readiness_override_reason
        enum status
        timestamptz created_at
    }
    verification_records {
        uuid id PK
        uuid match_id FK "UNIQUE"
        uuid social_worker_id
        enum decision
        text rationale "CHECK length 10+"
        timestamptz decided_at
    }
    group_decisions {
        uuid id PK
        uuid match_id FK "UNIQUE"
        enum decision
        uuid recorded_by
        timestamptz recorded_at
        text note
    }
    ledger_entries {
        uuid id PK
        uuid group_id FK
        uuid member_id FK "nullable"
        enum kind
        numeric amount
        date entry_date
        uuid recorded_by
        uuid reverses_entry_id FK
        text note
        timestamptz created_at
        boolean is_synthetic
    }
    match_eliminations {
        uuid id PK
        uuid opportunity_id FK
        uuid group_id FK
        text reason_code
        text explanation
        timestamptz created_at
    }
    user_profiles {
        uuid supabase_user_id PK
        enum role
        uuid federation_id
        uuid group_id FK
        text display_name
    }
```

**self_help_groups** is the unit everything attaches to. Location is village, district, state — deliberately no finer: there is no GPS, coordinate, or street-address column anywhere, and comments in the schema forbid adding them. `consent_status` makes a group's participation revocable; group name and village are the only quasi-identifying fields, and they identify a collective, not a person.

**members** exists so ledger entries can name who a loan went to. It holds name, phone, and language — and pointedly nothing else: no address (location lives on the group), no government ID, no biometrics. These are the most personally identifiable rows in the system, which is why they carry so little.

**capability_profiles** is UNIQUE on `group_id` by design: capability is an attribute of the collective. Opportunity and credit in the SHG model attach to the group — a tender is won by a federation or group, a bank loan is made to a group — so an individual-level profile would both misrepresent how the economics work and create a skills dossier on individual women that nothing in the system needs. The embedding is nullable because a profile exists the moment it is captured, before (or after revocation, without) a vector.

**opportunities** holds the cited summary as jsonb; `summary`, `deadline`, and `size_class` are nullable precisely so a failed extraction can be stored as a shell awaiting manual entry rather than padded with guesses.

**matches** is also group-level only — no member reference exists on the table. `reasons` is NOT NULL: a match that cannot explain itself is treated as a bug. The override columns are separate from `readiness_band` so a human disagreement never destroys the automated original.

**verification_records** and **group_decisions** are each UNIQUE per match: one professional judgement, one collective decision, both attributed and timestamped. These two tables are the audit spine.

**ledger_entries** is append-only, enforced by a trigger that rejects UPDATE and DELETE outright. A row with `member_id` set is personally identifiable — it says this woman borrowed this amount on this date — which is exactly why rows become identifiable only when that linkage is explicitly recorded, and why the table carries no other personal data. Corrections are reversing rows pointing at the original through `reverses_entry_id`, with the sign inverted and the reason on `note`.

**match_eliminations** records what the hard filters removed and why, so filtering stays accountable. **user_profiles** maps a Supabase identity to a role and scope; a CHECK pins the shape (social workers have a federation, bookkeepers a group, admins neither).

Note on synthetic flagging: `matches`, `verification_records`, `group_decisions`, `match_eliminations`, and `user_profiles` carry no `is_synthetic` column; the UI derives a match's badge from its group's and opportunity's flags, and synthetic user accounts carry a `[SYNTHETIC]` display-name prefix instead.

## 7. The matching pipeline in detail

The pipeline is four files in `backend/src/lib/matching/`, each independently testable without HTTP, orchestrated by `services/matching.ts`.

**Stage 1 — retrieve** (`retrieve.ts`). In: a query embedding and an opportunity id. Out: up to twenty candidates with group identity, district, capacity, and raw cosine similarity. This is the one raw SQL query outside migrations, because the pgvector `<=>` operator must appear verbatim in ORDER BY for Postgres to use the HNSW index. The query itself excludes any group whose `consent_status` is not `active` (`retrieve.ts:58`), skips profiles without embeddings, and skips groups already matched to this opportunity. Its failure mode is retrieving someone who should not be in the pool at all; consent exclusion in the SQL, under RLS, is the defence.

**Stage 2 — filter** (`filter.ts`). In: retrieval candidates plus the opportunity's requirements. Out: survivors and eliminations, each elimination with a reason code and sentence. Three hard constraints: profiled monthly capacity below the order quantity, delivery distance (estimated from districts, because village-granularity location is a deliberate constraint) beyond the configured radius, and a deadline inside the group's minimum lead time. These are filters, not score penalties, because semantic similarity cannot be trusted for feasibility: a two-loom weaving group and a ten-thousand-metre fabric tender read as near-identical text — similarity around 0.97 in the test fixture — and are not a possible match. A penalty would let high similarity rescue an impossible candidate; elimination removes it and writes down why. The failure mode this stage exists against is exactly that rescue.

**Stage 3 — readiness** (`readiness.ts`). In: thrift regularity over the last six months, internal-loan repayment rate, completed delivery count, and tenure, assessed against thresholds per order size class. Out: a band — ready, stretch, not_ready — and the top three contributing factors as sentences. It is pure rules; its only imports are two type definitions (`readiness.ts:1-2`), no model, no network. It outputs a band rather than a score, and never a cross-group ranking, because a precise number invites false confidence and silent ordering, and because the band must remain overridable: a group with thin ledgers in a poor district must not be permanently excluded by this function. Absent lending history is treated as untested, not as failure. The failure mode designed against is a savings threshold masquerading as a judgement — hence the multivariate seed fixture: a group with poor thrift but two completed deliveries lands in `stretch`, not `not_ready`.

**Stage 4 — rank** (`rank.ts`). In: survivors with their signals. Out: an ordered list where every score carries its reasons. The weights, exactly as coded in `RANK_WEIGHTS`:

| Signal | Weight |
| --- | --- |
| similarity | 0.35 |
| capacityHeadroom | 0.15 |
| readiness | 0.15 |
| distance | 0.10 |
| deadlineSlack | 0.10 |
| trackRecord | 0.10 |
| rotation | −0.05 |

Similarity is deliberately under half the total so feasibility and discipline can outvote text. The rotation adjustment is real, not cosmetic: the service queries for groups currently holding a match in any unresolved status (`services/matching.ts:105-120`) and subtracts the weight, because matching concentrates when nobody watches — the best-documented group wins the first match, accumulates history, ranks higher, and wins the next. Every non-zero contribution writes a plain-language reason; if a candidate somehow produces zero reasons, the function throws rather than emit an unexplainable match (`rank.ts:140-144`), and the service re-asserts the same before writing.

## 8. The AI components

There are exactly two AI capabilities, both reachable only through `backend/src/lib/ai/index.ts`, which exports two functions and nothing else.

**Structured extraction** turns a raw opportunity document into the cited summary. A simpler method is insufficient because the inputs are unstructured prose — government tenders in inconsistent formats, often needing translation-adjacent interpretation — and a regex or template parser would either reject nearly everything or, worse, extract confidently from the wrong clause. Input: the document text, the Zod summary schema, and an instruction. Output: a summary where every non-null field carries a page number and verbatim quote. Its named failure mode is confident fabrication — an invented lenient deadline or a dropped penalty clause, which for a group with no legal support is contractual exposure, not an inconvenience. The mitigation is structural: the output is validated against the full Zod schema including the citation refinement (`lib/ai/index.ts:46-56`), and any shortfall — timeout, malformed response, uncited field — causes the opportunity to be stored with `needs_manual_entry = true` and no summary at all (`services/opportunities.ts:86-99`). Nothing partial is ever written.

**Embedding** turns the canonical text rendering of a profile or opportunity summary into a vector for retrieval. A simpler method — keyword matching — fails on exactly the cases that matter: "stitching" versus "tailoring" versus "garment production" are the same capability in different words, across languages and transliterations. Input: text rendered by exactly one function per entity type (`lib/opportunities/renderForEmbedding.ts`, `lib/profiles/renderForEmbedding.ts`), so the same entity can never occupy two places in vector space. Output: a 1536-dimension vector. Its failure mode is silent dimensional or numeric corruption; the mitigation is a post-call check that every vector has exactly the expected dimension and finite values, failing closed otherwise (`lib/ai/index.ts:26-41`). The embedding is a nullable, retryable field — an embedding failure never blocks a valid record.

Every provider call runs under a deadline (`AI_PROVIDER_TIMEOUT_MS`) and fails closed on expiry. No vendor name appears anywhere outside `lib/ai/providers/`; the application selects providers by the `AI_EXTRACTION_PROVIDER` and `AI_EMBEDDING_PROVIDER` env values, which `providers/index.ts` maps to implementations. Swapping a provider means adding a file in `providers/`, adding a case to that map, and changing an env value — no application code changes. A deterministic `fake` provider ships for development and tests; it fabricates nothing (the extractor only quotes labelled lines from the given document) but its embeddings are hash-derived noise, so semantic similarity is meaningless until a real embedding provider is configured.

## 9. Security and access control

```mermaid
sequenceDiagram
    participant B as Browser
    participant SA as Supabase Auth
    participant N as Next.js middleware
    participant E as Express
    participant P as Postgres RLS

    B->>SA: signInWithPassword
    SA-->>B: JWT session (cookie via supabase ssr)
    B->>N: GET /dashboard
    N->>SA: getUser() — validate + refresh session
    N->>E: GET /api/v1/me (Bearer token)
    E->>E: verify JWT against JWKS (cached)
    E->>P: load own profile under RLS
    E-->>N: role
    N-->>B: route to the role's surface, or redirect
    B->>E: any data request (Bearer token)
    E->>E: requireAuth, requireRole, requireGroupAccess
    E->>P: query in transaction with app.current_user_id set
    P-->>E: only rows the policies allow
```

Three roles exist: `social_worker` (scoped to a federation), `bookkeeper` (scoped to one group), `admin` (unscoped). The backend never issues identities — Supabase Auth does; the backend verifies tokens against the project JWKS and attaches a role from `user_profiles`. There is no sign-up endpoint anywhere: accounts are provisioned by an administrator, because members do not self-register in this model.

Enforcement is two-layer. The application layer — `requireAuth`, `requireRole`, `requireGroupAccess` in `backend/src/lib/auth/middleware.ts` — exists to fail fast with clear status codes, and the frontend's route middleware exists for navigation. Neither is the security boundary. The boundary is row-level security: the API connects as a non-owner role (`sahayika_app`), every per-user query runs with `app.current_user_id` set transaction-locally, and the policies in migrations 0001–0008 decide what each role can see and write. Where the application and a policy disagree, the policy wins — the project's RLS integration test demonstrates this by removing all middleware and showing the rows still do not come back.

An attacker holding a valid bookkeeper token cannot: read any other group's ledger, profile, members, or matches (every policy scopes through `app_can_access_group`); read their own group's matches in `proposed` or `rejected` status (the read policy starts at `verified` — unverified matches do not exist for them, which is invariant 1 in the read path); update a match except along the verified→presented→accepted/declined path on their own group (migration 0006), with the presented step still subject to the verification trigger; update or delete any ledger row (no grant, no policy, and the append-only trigger behind both); or read other users' profiles. They can append to their own group's ledger and record their group's decisions — which is exactly their job.

## 10. What is deliberately not built

These are scope boundaries of this build, not discovered failures. The original design specifies each; the git history of the root README preserves the full specification.

The **financial-literacy tutor** (voice-first lessons on pricing and contracts) is a content-and-pedagogy effort more than a software one, and nothing else in the system depends on it. The **capital and grants gateway** sits last in the design's dependency chain — it needs delivery history that only accumulates after matching has run in the real world. **Inter-group lending** requires federation-level governance agreements that are organisational, not technical, prerequisites. **IVR and telephony** and **WhatsApp** channels require telecom integration and number provisioning out of scope for a demonstration build; the web surfaces were built first because they exercise every invariant. The **native Android app** is deferred in favour of a mobile-first web surface; the bookkeeper screens are designed for a shared phone at 360px, and the text-to-speech button is explicitly a stand-in for the specified voice interface, not a claim to be it. **Real procurement portal integration** is excluded so that no real tender, department, or reference number appears anywhere; ingestion accepts pasted documents, and every seeded opportunity names an obviously fictional issuer.

## 11. Running it locally

Prerequisites: Node 22+, pnpm 10+, Docker (for Postgres with pgvector). All commands below have been run successfully on this machine.

```sh
# 1. Database
docker run -d --name sahayika-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sahayika -p 5432:5432 pgvector/pgvector:pg17

# 2. Backend
cd backend
pnpm install
cp .env.example .env    # then edit; see variable notes below
pnpm db:migrate         # runs as ADMIN_DATABASE_URL (table owner)
docker exec sahayika-pg psql -U postgres -d sahayika \
  -c "ALTER ROLE sahayika_app LOGIN PASSWORD 'app';"
pnpm db:seed            # idempotent synthetic dataset
pnpm dev                # http://localhost:4000

# 3. Frontend (second terminal)
cd frontend
pnpm install
cp .env.example .env.local   # then edit
pnpm dev                     # http://localhost:3000
```

Backend variables: `ADMIN_DATABASE_URL` (owner, for migrations and seeding; locally `postgresql://postgres:postgres@localhost:5432/sahayika`), `DATABASE_URL` (the RLS-constrained role: `postgresql://sahayika_app:app@localhost:5432/sahayika` — pointing this at the owner silently disables row-level security), `SUPABASE_URL` and `SUPABASE_ANON_KEY` (token verification), `FRONTEND_ORIGIN`, and the `AI_*` provider settings (`fake` works offline). Frontend variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Honest caveat on sign-in: interactive login requires a Supabase Auth project (create users there and matching `user_profiles` rows, with the project using asymmetric JWT signing keys so the JWKS endpoint works). The development and e2e runs in this repository's history used a local stand-in that serves a JWKS and implements the password grant; that harness is not shipped in the repository, so out of the box the login page needs a real Supabase project. The backend API itself can be exercised with any JWT whose issuer and keys match `SUPABASE_URL` — the integration tests in `backend/src/app.integration.test.ts` show the pattern. The Playwright test (`pnpm test:e2e`) likewise expects both apps running, a seeded database, and that auth stand-in; run it with artifacts directed outside the project (`pnpm exec playwright test --output /tmp/pw-out`) because the Next dev watcher otherwise recompiles on Playwright's own trace writes and the reload loop breaks the run.

## 12. Seed data

`pnpm db:seed` loads one fictional federation in the invented "Samridhi Pradesh": twelve groups across four made-up districts, formation dates spread over eight years, capability profiles across eight trades with deliberately uneven capacity, twelve to eighteen months of ledger history per group in three discipline patterns (several regular, several irregular, and one group with poor thrift but two completed deliveries, so readiness visibly weighs more than savings), and twenty opportunities, each with a complete, fully cited summary. Four of the opportunities are historical and already delivered, giving two groups a track record, with verification and decision records attached so even synthetic history honours the invariants.

Every seeded record sets `is_synthetic = true`; the UI badges each one and shows a demonstration banner whenever any are visible. The two demonstration accounts carry a `[SYNTHETIC]` display-name prefix. The issuing bodies are deliberately absurd — "Office of Make-Believe Education", "Moonstone Hostel Trust", "Bureau of Fictitious Supplies" — so that no seeded opportunity can be mistaken for, or traced to, any real tender, department, or officer. Seeding is idempotent: deterministic IDs mean a second run inserts nothing.

## 13. Known limitations and current state

All twenty-two contract endpoints are implemented; no `not implemented` stub remains in non-test code. Backend: 75 unit tests pass, plus 24 integration tests against a live database (99 total). Frontend: typecheck, lint, and unit tests pass; the Playwright end-to-end test covering the full social-worker-to-bookkeeper path passes when run with artifacts outside the project directory, per the caveat in section 11.

What would need work before this touched a real group's data, beyond the deliberate scope cuts in section 10:

- A real embedding provider. Seeded embeddings come from the deterministic fake, so semantic similarity in the demo is noise near zero; rankings are currently carried by capacity, slack, readiness, and track record. The pipeline is correct; its first signal is not yet meaningful.
- An auth story that does not depend on a hand-built stand-in: a provisioned Supabase project, administrator tooling for creating accounts, and password-reset flows.
- Pagination and limits on list endpoints. `GET /opportunities`, the verification queue, and match history return unbounded result sets, and the ledger computes its running balance by loading the group's full history (`backend/src/services/ledger.ts:70-88`). Correct at seed scale; not at real scale.
- A separate test database. The integration suites truncate every table, which destroys seeded demo data when tests run against the development database.
- The rate limiter is in-memory and per-process; it does not survive restarts or span multiple instances.
- `PUT /groups/:id/profile`, `GET /reports/overview`, and `GET /me` have no direct automated tests — they are exercised only through the end-to-end UI path.
- The `completed` match status has no endpoint; delivery completion is unreachable through the API.
- No real-device check of the 360px claim; the layout was verified structurally, not on hardware.
- Eliminations accumulate across repeated matching runs with no run identifier; the verification screen deduplicates per group, but the table grows.
