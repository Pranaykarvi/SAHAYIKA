import { createBrowserClient } from "@supabase/ssr";

import { requireEnv } from "./env";

// Browser-side Supabase client — auth only (sign-in, session). All data
// access goes through the backend API via lib/api.
export function createClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  );
}
