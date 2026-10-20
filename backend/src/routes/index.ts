import { Router } from "express";

import { groupsRouter } from "./groups";
import { healthRouter } from "./health";
import { meRouter } from "./me";
import { ledgerRouter } from "./ledger";
import { matchesRouter } from "./matches";
import { matchingRouter } from "./matching";
import { opportunitiesRouter } from "./opportunities";
import { reportsRouter } from "./reports";

export const apiV1Router: Router = Router();

apiV1Router.use("/health", healthRouter);
apiV1Router.use(meRouter);
apiV1Router.use(opportunitiesRouter);
apiV1Router.use(groupsRouter);
apiV1Router.use(matchingRouter);
apiV1Router.use(matchesRouter);
apiV1Router.use(ledgerRouter);
apiV1Router.use(reportsRouter);
