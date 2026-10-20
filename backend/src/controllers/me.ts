import type { Request, Response } from "express";

import { getAuthContext } from "../lib/auth/context";
import { syntheticDataPresent } from "../services/me";
import { meResponseSchema } from "../validation/user-profiles";

// The authenticated caller's own profile — what the frontend uses to route
// by role — plus the demo-data signal for the application-wide banner.
export async function getMe(req: Request, res: Response): Promise<void> {
  const auth = getAuthContext(req);
  res.json(
    meResponseSchema.parse({
      userId: auth.userId,
      role: auth.role,
      federationId: auth.federationId,
      groupId: auth.groupId,
      syntheticDataPresent: await syntheticDataPresent(auth.userId),
    }),
  );
}
