import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { createClient } from "@/lib/auth/server";

// Bookkeeper surface: group ledger, savings, matches presented to the group.
export default async function GroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const api = await serverApi();
  const me = unwrap(await api.GET("/me"));

  return (
    <AppShell
      role={me.role}
      email={user.email ?? null}
      showDemoBanner={me.syntheticDataPresent}
    >
      {children}
    </AppShell>
  );
}
