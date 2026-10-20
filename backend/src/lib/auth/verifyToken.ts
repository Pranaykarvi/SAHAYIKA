import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

import { env } from "../env";

// Distinct rejection reasons so the logs say *why* a token failed, not just
// that it did. The client only ever learns 401.
export type TokenRejectionReason =
  | "expired"
  | "wrong_audience"
  | "wrong_issuer"
  | "invalid_signature"
  | "malformed"
  | "unverifiable";

export class TokenVerificationError extends Error {
  constructor(
    public readonly reason: TokenRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

export interface VerifiedToken {
  userId: string;
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

function mapJoseError(err: unknown): TokenVerificationError {
  if (err instanceof TokenVerificationError) return err;
  if (err instanceof errors.JWTExpired) {
    return new TokenVerificationError("expired", "token has expired");
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    if (err.claim === "aud") {
      return new TokenVerificationError(
        "wrong_audience",
        "token audience does not match",
      );
    }
    if (err.claim === "iss") {
      return new TokenVerificationError(
        "wrong_issuer",
        "token issuer does not match",
      );
    }
    return new TokenVerificationError(
      "unverifiable",
      `token claim rejected: ${err.claim}`,
    );
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    return new TokenVerificationError(
      "invalid_signature",
      "token signature does not verify",
    );
  }
  if (
    err instanceof errors.JWSInvalid ||
    err instanceof errors.JWTInvalid
  ) {
    return new TokenVerificationError("malformed", "token is not a valid JWT");
  }
  return new TokenVerificationError(
    "unverifiable",
    err instanceof Error ? err.message : "token could not be verified",
  );
}

// Factory so tests can verify against a local key set; production uses the
// Supabase JWKS below.
export function createTokenVerifier(options: {
  getKey: JWTVerifyGetKey;
  issuer: string;
  audience: string;
}): TokenVerifier {
  return async function verifyToken(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, options.getKey, {
        issuer: options.issuer,
        audience: options.audience,
      });
      if (!payload.sub) {
        throw new TokenVerificationError("malformed", "token has no subject");
      }
      return { userId: payload.sub };
    } catch (err) {
      throw mapJoseError(err);
    }
  };
}

let supabaseVerifier: TokenVerifier | null = null;

// Verifies against the Supabase project's JWKS. createRemoteJWKSet caches
// fetched keys in memory and rate-limits refetches, so steady-state requests
// never block on an HTTP call. Requires the project to use asymmetric JWT
// signing keys (the JWKS endpoint is empty on legacy HS256 projects).
export function getSupabaseTokenVerifier(): TokenVerifier {
  if (supabaseVerifier) return supabaseVerifier;
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL must be set to verify bearer tokens");
  }
  const issuer = `${env.SUPABASE_URL}/auth/v1`;
  supabaseVerifier = createTokenVerifier({
    getKey: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
    issuer,
    audience: env.SUPABASE_JWT_AUDIENCE,
  });
  return supabaseVerifier;
}
