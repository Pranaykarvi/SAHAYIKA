import type { Request, Response } from "express";

import { checkHealth } from "../services/health";
import { healthResponseSchema } from "../validation/health";

export function getHealth(_req: Request, res: Response): void {
  const health = checkHealth();
  res.json(healthResponseSchema.parse(health));
}
