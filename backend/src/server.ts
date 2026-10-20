import { createApp } from "./app";
import { env } from "./lib/env";
import { logger } from "./lib/logger";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "sahayika backend listening");
});

// Finish in-flight requests before exiting so deploys never drop a request
// mid-response.
function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close((err) => {
    if (err) {
      logger.error({ err }, "error during shutdown");
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
