import { AsyncLocalStorage } from "node:async_hooks";

// Carries the request id across async boundaries so EVERY log line written
// anywhere during a request — services, audit lines, error handler — carries
// it (see the pino mixin in lib/logger.ts).
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
