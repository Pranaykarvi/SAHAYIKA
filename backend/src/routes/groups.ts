import { Router } from "express";

import {
  getCapabilityProfile,
  getGroup,
  listGroups,
  updateGroupConsent,
  upsertCapabilityProfile,
} from "../controllers/groups";
import { requireAuth, requireGroupAccess, requireRole } from "../lib/auth";

export const groupsRouter: Router = Router();

// List is social-worker only (own federation, filtered in the service and by
// RLS). The per-group routes admit the group's own bookkeeper as well;
// requireGroupAccess pins "own".
groupsRouter.get(
  "/groups",
  requireAuth,
  requireRole("social_worker", "admin"),
  listGroups,
);
groupsRouter.get(
  "/groups/:id",
  requireAuth,
  requireRole("social_worker", "bookkeeper", "admin"),
  requireGroupAccess("id"),
  getGroup,
);
groupsRouter.patch(
  "/groups/:id/consent",
  requireAuth,
  requireRole("social_worker", "admin"),
  requireGroupAccess("id"),
  updateGroupConsent,
);
groupsRouter.get(
  "/groups/:id/profile",
  requireAuth,
  requireRole("social_worker", "bookkeeper", "admin"),
  requireGroupAccess("id"),
  getCapabilityProfile,
);
groupsRouter.put(
  "/groups/:id/profile",
  requireAuth,
  requireRole("social_worker", "bookkeeper", "admin"),
  requireGroupAccess("id"),
  upsertCapabilityProfile,
);
