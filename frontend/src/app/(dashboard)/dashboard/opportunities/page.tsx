import Link from "next/link";

import { SampleBadge } from "@/components/sample-badge";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { fmtDate } from "@/lib/format";

export default async function OpportunitiesPage() {
  const api = await serverApi();
  const opportunities = unwrap(await api.GET("/opportunities"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <Button asChild>
          <Link href="/dashboard/opportunities/new">Manual entry</Link>
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {opportunities.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-4 p-3 text-sm">
            <span className="flex items-center gap-2">
              <Link href={`/dashboard/opportunities/${o.id}`} className="hover:underline">
                {o.title}
              </Link>
              {o.isSynthetic ? <SampleBadge /> : null}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {o.needsManualEntry
                ? "needs manual entry"
                : `${o.sizeClass ?? "unclassified"} · ${fmtDate(o.deadline)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
