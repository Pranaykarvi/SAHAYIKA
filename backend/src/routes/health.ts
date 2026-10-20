import { Router } from "express";

import { getHealth } from "../controllers/health";

export const healthRouter: Router = Router();

healthRouter.get("/", getHealth);
