import Link from "next/link";

import { DemoBanner } from "@/components/sample-badge";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { signOutAction } from "@/lib/auth/actions";

type Role = components["schemas"]["Me"]["role"];

const SOCIAL_WORKER_NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/queue", label: "Queue" },
  { href: "/dashboard/opportunities", label: "Opportunities" },
  { href: "/dashboard/distribution", label: "Distribution" },
];

const NAV: Record<Role, Array<{ href: string; label: string }>> = {
  social_worker: SOCIAL_WORKER_NAV,
  admin: SOCIAL_WORKER_NAV,
  bookkeeper: [
    { href: "/group", label: "Profile" },
    { href: "/group/opportunities", label: "Opportunities" },
    { href: "/group/ledger", label: "Ledger" },
  ],
};

// Shared chrome for both role surfaces: who is signed in, role-appropriate
// navigation, and sign-out. Server component — interactivity is limited to
// the sign-out form action.
export function AppShell({
  role,
  email,
  showDemoBanner,
  children,
}: {
  role: Role;
  email: string | null;
  showDemoBanner: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {showDemoBanner ? <DemoBanner /> : null}
      {/* Wraps instead of truncating so the shell works at 360px. */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href="/" className="font-semibold tracking-tight">
            Sahayika
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV[role].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-1 text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {email ?? "signed in"} · {role.replace("_", " ")}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
