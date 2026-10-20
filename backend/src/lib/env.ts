import { z } from "zod";

// All environment access goes through this parsed object so a bad or missing
// variable fails loudly at startup, not deep inside a request handler.
// DATABASE_URL and the Supabase keys are optional here because the server can
// boot without them; the modules that need them assert their presence.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
  DATABASE_URL: z.string().url().optional(),
  ADMIN_DATABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().default("authenticated"),
  // AI slots are vendor-neutral here: the values are provider ids resolved
  // inside src/lib/ai/providers/, the only place vendor names may appear.
  AI_EXTRACTION_PROVIDER: z.string().optional(),
  AI_EMBEDDING_PROVIDER: z.string().optional(),
  AI_EXTRACTION_MODEL: z.string().optional(),
  AI_EMBEDDING_MODEL: z.string().optional(),
  AI_EXTRACTION_API_KEY: z.string().optional(),
  AI_EMBEDDING_API_KEY: z.string().optional(),
  AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // A group holding more than this share of a federation's active matches is
  // flagged in the distribution report.
  REPORTS_CONCENTRATION_SHARE: z.coerce.number().min(0).max(1).default(0.4),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
