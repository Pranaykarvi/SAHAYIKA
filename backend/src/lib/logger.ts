import { pino } from "pino";

import { env } from "./env";
import { requestContext } from "./request-context";

export const logger = pino({
  level: env.LOG_LEVEL,
  // Every log line emitted inside a request carries its request id — the
  // audit trail is correlatable without any caller remembering to pass it.
  mixin() {
    const store = requestContext.getStore();
    return store ? { requestId: store.requestId } : {};
  },
});
