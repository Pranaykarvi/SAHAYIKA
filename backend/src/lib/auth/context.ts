import type { Request } from "express";

import type { UserRole } from "../../validation/user-profiles";
import { ApiError } from "../errors";

export interface AuthContext {
  userId: string;
  role: UserRole;
  federationId: string | null;
  groupId: string | null;
}

// For controllers: requireAuth always runs first on authenticated routes, so
// a missing context is a wiring bug — surfaced as a 401, never a crash.
export function getAuthContext(req: Request): AuthContext {
  if (!req.auth) {
    throw new ApiError(401, "UNAUTHENTICATED", "authentication required");
  }
  return req.auth;
}

// requireAuth attaches the verified context here; downstream middleware and
// controllers read it. Services never see this type — they take plain ids.
declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}
