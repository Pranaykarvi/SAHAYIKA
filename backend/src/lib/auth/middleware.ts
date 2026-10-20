import type { RequestHandler } from "express";
import { z } from "zod";

import type { UserRole } from "../../validation/user-profiles";
import { logger } from "../logger";
import type { AuthContext } from "./context";
import {
  TokenVerificationError,
  type TokenVerifier,
} from "./verifyToken";

const uuidSchema = z.string().uuid();

export interface RequireAuthDeps {
  verifyToken: TokenVerifier;
  loadProfile: (userId: string) => Promise<AuthContext | null>;
}

// Factory form so tests can supply a local-key verifier and a stub profile
// loader; the wired instances live in ./index.ts.
export function createRequireAuth(deps: RequireAuthDeps): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "missing bearer token" },
      });
      return;
    }

    let userId: string;
    try {
      ({ userId } = await deps.verifyToken(header.slice("Bearer ".length)));
    } catch (err) {
      const reason =
        err instanceof TokenVerificationError ? err.reason : "unverifiable";
      logger.warn({ reason }, "rejected bearer token");
      res.status(401).json({
        error: {
          code: `TOKEN_${reason.toUpperCase()}`,
          message: "bearer token rejected",
        },
      });
      return;
    }

    const profile = await deps.loadProfile(userId);
    if (!profile) {
      // A valid Supabase identity with no profile is not an account here.
      // There is deliberately no sign-up endpoint: an administrator creates
      // user_profiles rows, because members do not self-register.
      logger.warn({ userId }, "valid token but no user profile");
      res.status(403).json({
        error: {
          code: "NOT_PROVISIONED",
          message: "account not provisioned",
        },
      });
      return;
    }

    req.auth = profile;
    next();
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    const auth = req.auth;
    if (!auth) {
      logger.error("requireRole ran without requireAuth before it");
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "authentication required" },
      });
      return;
    }
    if (!roles.includes(auth.role)) {
      logger.warn(
        { userId: auth.userId, role: auth.role, required: roles },
        "role not permitted for this route",
      );
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "role not permitted" },
      });
      return;
    }
    next();
  };
}

export interface GroupAccessDeps {
  loadGroupFederationId: (
    requestingUserId: string,
    groupId: string,
  ) => Promise<string | null>;
}

// A bookkeeper may only reach their own group; a social worker only groups
// in their own federation; an admin any group. The RLS policies enforce the
// same rules underneath — this check exists to fail fast with a clear 403,
// RLS exists so a mistake here cannot leak data. Where they disagree, RLS
// wins.
export function createRequireGroupAccess(deps: GroupAccessDeps) {
  return function requireGroupAccess(paramName: string): RequestHandler {
    return async (req, res, next) => {
      const auth = req.auth;
      if (!auth) {
        logger.error("requireGroupAccess ran without requireAuth before it");
        res.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "authentication required",
          },
        });
        return;
      }

      const parsed = uuidSchema.safeParse(req.params[paramName]);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "VALIDATION", message: `${paramName} must be a uuid` },
        });
        return;
      }
      const groupId = parsed.data;

      if (auth.role === "admin") {
        next();
        return;
      }

      if (auth.role === "bookkeeper") {
        if (auth.groupId === groupId) {
          next();
          return;
        }
        logger.warn(
          { userId: auth.userId, ownGroupId: auth.groupId, groupId },
          "bookkeeper denied access to another group",
        );
        res.status(403).json({
          error: { code: "FORBIDDEN", message: "not your group" },
        });
        return;
      }

      // social_worker: the group must exist in their federation. The lookup
      // itself runs inside the caller's RLS context, so a group outside the
      // federation is simply invisible and resolves to null.
      const federationId = await deps.loadGroupFederationId(
        auth.userId,
        groupId,
      );
      if (federationId === null) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "group not found" },
        });
        return;
      }
      if (federationId === auth.federationId) {
        next();
        return;
      }
      logger.warn(
        { userId: auth.userId, federationId: auth.federationId, groupId },
        "social worker denied access to a group outside their federation",
      );
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "not your federation" },
      });
    };
  };
}
