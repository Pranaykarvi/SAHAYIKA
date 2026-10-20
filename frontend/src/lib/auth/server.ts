import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireEnv } from "./env";

// Server-side Supabase client for server components and route handlers —
// auth only. setAll is a no-op in server components (cookies are read-only
// there); middleware owns session refresh when it arrives.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies cannot be
            // written. Safe to ignore.
          }
        },
      },
    },
  );
}
