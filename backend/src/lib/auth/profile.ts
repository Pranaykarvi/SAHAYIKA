import { eq } from "drizzle-orm";

import { runAsUser } from "../../db/client";
import { selfHelpGroups, userProfiles } from "../../db/schema";
import type { AuthContext } from "./context";

// Runs inside the caller's own RLS context: the user_profiles_select_own
// policy permits exactly this row and nothing else.
export async function loadProfile(userId: string): Promise<AuthContext | null> {
  const rows = await runAsUser(userId, (tx) =>
    tx
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.supabaseUserId, userId))
      .limit(1),
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.supabaseUserId,
    role: row.role,
    federationId: row.federationId,
    groupId: row.groupId,
  };
}

// Also RLS-scoped: a group outside the caller's reach is invisible and
// resolves to null, which requireGroupAccess turns into a 404.
export async function loadGroupFederationId(
  requestingUserId: string,
  groupId: string,
): Promise<string | null> {
  const rows = await runAsUser(requestingUserId, (tx) =>
    tx
      .select({ federationId: selfHelpGroups.federationId })
      .from(selfHelpGroups)
      .where(eq(selfHelpGroups.id, groupId))
      .limit(1),
  );
  return rows[0]?.federationId ?? null;
}
