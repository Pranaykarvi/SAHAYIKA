CREATE TABLE "match_eliminations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_eliminations" ADD CONSTRAINT "match_eliminations_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_eliminations" ADD CONSTRAINT "match_eliminations_group_id_self_help_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."self_help_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT ON match_eliminations TO sahayika_app;--> statement-breakpoint
ALTER TABLE match_eliminations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Backs up requireGroupAccess / the social-worker dashboard scope: an
-- elimination is visible on exactly the same group scope as the group
-- itself. Bookkeepers can technically read their own group's eliminations;
-- that is correct — it is their group.
CREATE POLICY match_eliminations_select ON match_eliminations FOR SELECT
USING (app_can_access_group(group_id));--> statement-breakpoint
-- Backs up requireRole('social_worker','admin') on POST /matching/run — the
-- only writer of eliminations is the matching pipeline a social worker runs.
CREATE POLICY match_eliminations_insert ON match_eliminations FOR INSERT
WITH CHECK (app_is_admin() OR (app_role() = 'social_worker' AND app_can_access_group(group_id)));