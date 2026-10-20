import { Router } from "express";

import { getMe } from "../controllers/me";
import { requireAuth } from "../lib/auth";

export const meRouter: Router = Router();

meRouter.get("/me", requireAuth, getMe);
