import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Sahayika</h1>
      <p className="max-w-prose text-center text-muted-foreground">
        Connecting Self-Help Groups to economic opportunity — verified by a
        social worker, decided by the group.
      </p>
      <Button asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </main>
  );
}
