import { createClient as createServerSupabase } from "../auth/server";
import { createApi, type ApiClient } from "./client";

// Variant for server components and route handlers: the session comes from
// the request cookies via the Supabase server client. Build one per request —
// cookies() is request-scoped.
export async function serverApi(): Promise<ApiClient> {
  return createApi(async () => {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  });
}
