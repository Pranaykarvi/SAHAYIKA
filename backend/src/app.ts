import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { errorHandler, notFoundHandler } from "./lib/error-handler";
import { env } from "./lib/env";
import { requestContext } from "./lib/request-context";
import { healthRouter } from "./routes/health";
import { apiV1Router } from "./routes";

export function createApp(): Express {
  const app = express();

  app.use(helmet());

  // Request-id first, so every log line anywhere in the request carries it
  // (the pino mixin reads this context). Honour an inbound id for tracing
  // across hops; mint one otherwise.
  app.use((req, res, next) => {
    const header = req.headers["x-request-id"];
    const requestId =
      typeof header === "string" && header.length > 0 ? header : randomUUID();
    res.setHeader("x-request-id", requestId);
    requestContext.run({ requestId }, next);
  });

  // Only the frontend origin may call this API, and cookies/credentials are
  // allowed so Supabase auth sessions can cross the boundary.
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );

  app.use(express.json());

  // Unversioned health for ops probes; the same endpoint is also in /api/v1.
  app.use("/health", healthRouter);

  // The whole API surface, as described by openapi.json. There is
  // deliberately no sign-up route anywhere in this app: accounts are
  // provisioned by an administrator, because members do not self-register in
  // this model. The backend never issues tokens — it only verifies Supabase's.
  app.use("/api/v1", apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
