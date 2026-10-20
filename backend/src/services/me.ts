import { eq } from "drizzle-orm";

import { runAsUser } from "../db/client";
import { opportunities, selfHelpGroups } from "../db/schema";

// True when any synthetic group or opportunity is visible to this account.
// Drives the application-wide demonstration banner (invariant 7).
export async function syntheticDataPresent(
  requestingUserId: string,
): Promise<boolean> {
  return runAsUser(requestingUserId, async (tx) => {
    const opp = await tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.isSynthetic, true))
      .limit(1);
    if (opp.length > 0) return true;
    const group = await tx
      .select({ id: selfHelpGroups.id })
      .from(selfHelpGroups)
      .where(eq(selfHelpGroups.isSynthetic, true))
      .limit(1);
    return group.length > 0;
  });
}
