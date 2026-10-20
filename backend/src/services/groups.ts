import { asc, eq } from "drizzle-orm";

import { runAsUser } from "../db/client";
import { capabilityProfiles, selfHelpGroups } from "../db/schema";
import { embed } from "../lib/ai";
import { NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { renderProfileForEmbedding } from "../lib/profiles/renderForEmbedding";
import type {
  CapabilityProfileResponse,
  CapabilityProfileUpsertRequest,
} from "../validation/capability-profiles";
import type {
  ConsentUpdateRequest,
  SelfHelpGroupResponse,
} from "../validation/self-help-groups";

type GroupRow = typeof selfHelpGroups.$inferSelect;

function toGroupResponse(row: GroupRow): SelfHelpGroupResponse {
  return {
    id: row.id,
    name: row.name,
    federationId: row.federationId,
    village: row.village,
    district: row.district,
    state: row.state,
    formedOn: row.formedOn,
    bookkeeperMemberId: row.bookkeeperMemberId,
    consentStatus: row.consentStatus,
    isSynthetic: row.isSynthetic,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// RLS scopes the rows: a social worker only ever receives their own
// federation's groups, with no service-side filter to forget.
export async function listGroups(
  requestingUserId: string,
): Promise<SelfHelpGroupResponse[]> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx.select().from(selfHelpGroups).orderBy(asc(selfHelpGroups.name)),
  );
  return rows.map(toGroupResponse);
}

export async function getGroup(
  requestingUserId: string,
  groupId: string,
): Promise<SelfHelpGroupResponse> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select()
      .from(selfHelpGroups)
      .where(eq(selfHelpGroups.id, groupId))
      .limit(1),
  );
  const row = rows[0];
  if (!row) throw new NotFoundError("group not found");
  return toGroupResponse(row);
}

export async function updateGroupConsent(
  requestingUserId: string,
  groupId: string,
  input: ConsentUpdateRequest,
): Promise<SelfHelpGroupResponse> {
  return runAsUser(requestingUserId, async (tx) => {
    const rows = await tx
      .update(selfHelpGroups)
      .set({ consentStatus: input.consentStatus, updatedAt: new Date() })
      .where(eq(selfHelpGroups.id, groupId))
      .returning();
    const row = rows[0];
    if (!row) throw new NotFoundError("group not found");

    // Revocation is immediate and material: the retrieval query already
    // excludes any non-active group from every future matching run, and on
    // top of that the profile embedding is nulled so the group's capability
    // text cannot even be a nearest-neighbour candidate. Suspension keeps
    // the embedding (it is reversible); revocation does not.
    if (input.consentStatus === "revoked") {
      await tx
        .update(capabilityProfiles)
        .set({ embedding: null, embeddingUpdatedAt: null })
        .where(eq(capabilityProfiles.groupId, groupId));
    }

    logger.info(
      {
        audit: "consent_update",
        actor: requestingUserId,
        groupId,
        consentStatus: input.consentStatus,
        reason: input.reason ?? null,
      },
      "group consent updated",
    );

    return toGroupResponse(row);
  });
}

export async function getCapabilityProfile(
  requestingUserId: string,
  groupId: string,
): Promise<CapabilityProfileResponse> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select()
      .from(capabilityProfiles)
      .where(eq(capabilityProfiles.groupId, groupId))
      .limit(1),
  );
  const row = rows[0];
  if (!row) throw new NotFoundError("this group has no capability profile yet");
  return toProfileResponse(row);
}

type ProfileRow = typeof capabilityProfiles.$inferSelect;

function toProfileResponse(row: ProfileRow): CapabilityProfileResponse {
  return {
    id: row.id,
    groupId: row.groupId,
    skills: row.skills,
    certifications: row.certifications,
    capacity: row.capacity,
    equipment: row.equipment,
    embeddingUpdatedAt: row.embeddingUpdatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    isSynthetic: row.isSynthetic,
  };
}

// Create-or-replace the group's profile. Saving re-embeds on the backend —
// the frontend never computes or sees vectors. If the group's consent is not
// active, no embedding is written: revocation removed it and a profile edit
// must not quietly restore it (retrieval excludes non-active groups anyway;
// this keeps the stored data consistent with the promise).
export async function upsertCapabilityProfile(
  requestingUserId: string,
  groupId: string,
  input: CapabilityProfileUpsertRequest,
): Promise<CapabilityProfileResponse> {
  let embedding: number[] | null = null;
  try {
    const [vector] = await embed([renderProfileForEmbedding(input)]);
    embedding = vector ?? null;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      "profile embedding failed; saving without embedding",
    );
  }

  return runAsUser(requestingUserId, async (tx) => {
    const groupRows = await tx
      .select({ consentStatus: selfHelpGroups.consentStatus })
      .from(selfHelpGroups)
      .where(eq(selfHelpGroups.id, groupId))
      .limit(1);
    const group = groupRows[0];
    if (!group) throw new NotFoundError("group not found");

    const now = new Date();
    const allowEmbedding = group.consentStatus === "active" && embedding !== null;
    const values = {
      skills: input.skills,
      certifications: input.certifications,
      capacity: input.capacity,
      equipment: input.equipment,
      embedding: allowEmbedding ? embedding : null,
      embeddingUpdatedAt: allowEmbedding ? now : null,
      updatedAt: now,
    };
    const rows = await tx
      .insert(capabilityProfiles)
      .values({ groupId, ...values })
      .onConflictDoUpdate({
        target: capabilityProfiles.groupId,
        set: values,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("profile upsert returned no row");

    logger.info(
      { audit: "profile_update", actor: requestingUserId, groupId },
      "capability profile saved",
    );
    return toProfileResponse(row);
  });
}
