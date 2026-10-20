// The one loading convention, shared by every route's loading.tsx.
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <p className="animate-pulse text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
