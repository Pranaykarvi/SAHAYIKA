import createClient, { type Middleware } from "openapi-fetch";

import { createClient as createBrowserSupabase } from "../auth/client";
import type { paths } from "./schema";

// The only road to data. Every call in the application goes through a client
// built here, typed end-to-end by the generated schema (src/lib/api/schema.d.ts,
// regenerated from backend/openapi.json — never hand-write a type that
// duplicates a backend shape). The server-component variant lives in
// ./server.ts because it depends on next/headers.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// The contract's server base path; openapi-fetch does not apply the
// document's `servers` entry itself.
export const API_BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = {
  error?: { code?: string; message?: string; details?: unknown };
};

// Converts an openapi-fetch result into data-or-throw, translating the
// backend's standard { error: { code, message } } shape into a typed ApiError.
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.error !== undefined || result.data === undefined) {
    const body = (result.error ?? {}) as ErrorBody;
    throw new ApiError(
      result.response.status,
      body.error?.code ?? "UNKNOWN",
      body.error?.message ??
        `request failed with status ${result.response.status}`,
      body.error?.details,
    );
  }
  return result.data;
}

export type ApiClient = ReturnType<typeof createClient<paths>>;

// Retries idempotent GETs only — a POST/PUT/PATCH is NEVER replayed, because
// replaying a write (a verification, a decision, a ledger entry) is worse
// than failing it. Network errors and 5xx responses retry with a short
// backoff; 4xx never retries.
async function fetchWithRetry(input: Request): Promise<Response> {
  const attempts = input.method === "GET" ? 3 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const request = attempt < attempts ? input.clone() : input;
      const response = await fetch(request);
      if (response.status < 500 || attempt === attempts) return response;
      lastError = new Error(`upstream ${response.status}`);
    } catch (err) {
      if (attempt === attempts) throw err;
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("request failed");
}

export function createApi(
  getToken: () => Promise<string | null>,
): ApiClient {
  const client = createClient<paths>({
    baseUrl: API_BASE,
    fetch: fetchWithRetry,
  });
  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await getToken();
      if (token) request.headers.set("authorization", `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}

// Variant for client components: the Supabase browser client supplies the
// access token from the current session.
let browserClient: ApiClient | null = null;
export function browserApi(): ApiClient {
  if (!browserClient) {
    browserClient = createApi(async () => {
      const { data } = await createBrowserSupabase().auth.getSession();
      return data.session?.access_token ?? null;
    });
  }
  return browserClient;
}
