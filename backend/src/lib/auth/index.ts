import {
  createRequireAuth,
  createRequireGroupAccess,
  requireRole,
} from "./middleware";
import { loadGroupFederationId, loadProfile } from "./profile";
import { getSupabaseTokenVerifier } from "./verifyToken";

// Wired instances for routes. The verifier is resolved lazily so importing
// this module never requires SUPABASE_URL (only serving a request does).
export const requireAuth = createRequireAuth({
  verifyToken: (token) => getSupabaseTokenVerifier()(token),
  loadProfile,
});

export const requireGroupAccess = createRequireGroupAccess({
  loadGroupFederationId,
});

export { requireRole };
export type { AuthContext } from "./context";
