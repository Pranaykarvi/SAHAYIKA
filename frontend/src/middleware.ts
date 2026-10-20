import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { components } from "@/lib/api/schema";

type Me = components["schemas"]["Me"];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Role comes from the backend (/me), never from a client-side guess. This
// check exists for navigation — sending each role to its own surface — not
// for security: the backend enforces roles and row-level security
// independently on every request.
async function fetchRole(accessToken: string): Promise<Me["role"] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const me = (await res.json()) as Me;
    return me.role;
  } catch {
    return null;
  }
}

function homeFor(role: Me["role"]): string {
  return role === "bookkeeper" ? "/group" : "/dashboard";
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() validates against the auth server and refreshes the session —
  // the reason this middleware exists at all.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const wantsDashboard = path.startsWith("/dashboard");
  const wantsGroup = path.startsWith("/group");

  if (!user) {
    if (wantsDashboard || wantsGroup) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const role = session ? await fetchRole(session.access_token) : null;
  if (!role) {
    // Authenticated with Supabase but not provisioned on the backend —
    // nothing to show; back to login.
    if (wantsDashboard || wantsGroup) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  const home = homeFor(role);
  if (path === "/login") {
    return NextResponse.redirect(new URL(home, request.url));
  }
  if (wantsDashboard && role !== "social_worker" && role !== "admin") {
    return NextResponse.redirect(new URL(home, request.url));
  }
  if (wantsGroup && role !== "bookkeeper") {
    return NextResponse.redirect(new URL(home, request.url));
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/group/:path*", "/login"],
};
