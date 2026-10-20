import { createClient } from "./server";

// Returns the authenticated Supabase user, or null when signed out. Uses
// getUser (verified against the auth server), not getSession, so a forged
// cookie cannot impersonate anyone.
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
