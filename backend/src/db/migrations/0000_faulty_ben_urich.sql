CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."group_decision" AS ENUM('accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."opportunity_source" AS ENUM('portal', 'partner', 'manual', 'seed');--> statement-breakpoint
CREATE TYPE "public"."size_class" AS ENUM('small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('proposed', 'verified', 'rejected', 'presented', 'accepted', 'declined', 'completed');--> statement-breakpoint
CREATE TYPE "public"."readiness_band" AS ENUM('ready', 'stretch', 'not_ready');--> statement-breakpoint
CREATE TYPE "public"."verification_decision" AS ENUM('approved', 'rejected', 'needs_information');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('thrift', 'internal_loan', 'repayment', 'expense', 'income');--> statement-breakpoint
CREATE TABLE "capability_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"skills" text[] NOT NULL,
	"certifications" jsonb NOT NULL,
	"capacity" jsonb NOT NULL,
	"equipment" text[] NOT NULL,
	"embedding" vector(1536),
	"embedding_updated_at" timestamp with time zone,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "capability_profiles_group_id_unique" UNIQUE("group_id")
);
--> statement-breakpoint
CREATE TABLE "group_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"decision" "group_decision" NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "group_decisions_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "self_help_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"federation_id" uuid NOT NULL,
	"village" text NOT NULL,
	"district" text NOT NULL,
	"state" text NOT NULL,
	"formed_on" date NOT NULL,
	"bookkeeper_member_id" uuid,
	"consent_status" "consent_status" DEFAULT 'active' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"preferred_language" text NOT NULL,
	"joined_on" date NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "opportunity_source" NOT NULL,
	"title" text NOT NULL,
	"summary" jsonb NOT NULL,
	"document_ref" text,
	"deadline" date NOT NULL,
	"size_class" "size_class" NOT NULL,
	"embedding" vector(1536),
	"needs_manual_entry" boolean DEFAULT false NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"score" numeric NOT NULL,
	"reasons" jsonb NOT NULL,
	"readiness_band" "readiness_band" NOT NULL,
	"readiness_override" "readiness_band",
	"readiness_override_reason" text,
	"status" "match_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_group_id_opportunity_id_unique" UNIQUE("group_id","opportunity_id"),
	CONSTRAINT "matches_override_requires_reason" CHECK ("matches"."readiness_override" IS NULL OR "matches"."readiness_override_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"social_worker_id" uuid NOT NULL,
	"decision" "verification_decision" NOT NULL,
	"rationale" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_records_match_id_unique" UNIQUE("match_id"),
	CONSTRAINT "verification_records_rationale_min_length" CHECK (char_length("verification_records"."rationale") >= 10)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid,
	"kind" "ledger_kind" NOT NULL,
	"amount" numeric NOT NULL,
	"entry_date" date NOT NULL,
	"recorded_by" uuid NOT NULL,
	"reverses_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capability_profiles" ADD CONSTRAINT "capability_profiles_group_id_self_help_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."self_help_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_decisions" ADD CONSTRAINT "group_decisions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_self_help_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."self_help_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_group_id_self_help_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."self_help_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_group_id_self_help_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."self_help_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_entry_id_ledger_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capability_profiles_embedding_hnsw_idx" ON "capability_profiles" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "opportunities_embedding_hnsw_idx" ON "opportunities" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- ledger_entries is append-only. Financial history is evidence — the readiness
-- layer reads it as the group's real discipline, so rewriting or erasing a row
-- would quietly corrupt the most honest signal the platform has. Corrections
-- are new rows pointing at the original via reverses_entry_id.
CREATE FUNCTION ledger_entries_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % is not allowed. Insert a reversing entry via reverses_entry_id instead.', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_update_no_delete
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();--> statement-breakpoint
-- Invariant 1 lives here, in the database, and not only in a route handler:
-- a handler can be bypassed by a future code path, a background job, or a
-- direct query, and the guarantee that no group ever sees an unverified match
-- is the project's central claim, not a UI convention. Whatever path tries to
-- move a match to 'presented', this trigger is the floor it cannot go under.
-- (It also fires on INSERT: a row can never be born 'presented', because an
-- approved verification cannot exist before the match row it references.)
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
$$;--> statement-breakpoint
CREATE TRIGGER matches_verification_guard
BEFORE INSERT OR UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION matches_require_approved_verification();