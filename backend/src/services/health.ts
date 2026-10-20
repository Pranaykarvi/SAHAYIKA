import type { HealthResponse } from "../validation/health";

export function checkHealth(): HealthResponse {
  return {
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
