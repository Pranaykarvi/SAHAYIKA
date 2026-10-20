"use client";

import { Button } from "@/components/ui/button";

// Global error boundary. Route groups inherit it; anything thrown in a
// server component (including ApiError from the client wrapper) lands here
// rather than white-screening.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="max-w-prose text-center text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </main>
  );
}
