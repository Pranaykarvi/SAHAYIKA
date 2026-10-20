// Invariant 7: nothing fabricated may look real. Rendered next to every
// synthetic record — lists, cards, and detail views alike — with no prop,
// setting, or flag that can turn it off.
export function SampleBadge() {
  return (
    <span className="inline-block shrink-0 rounded bg-amber-300 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-amber-950">
      Sample data
    </span>
  );
}

// The application-wide banner, shown whenever any synthetic record is
// visible to the signed-in account.
export function DemoBanner() {
  return (
    <div className="bg-amber-300 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
      Demonstration build — this environment contains synthetic sample data.
      Nothing here describes real groups or real tenders.
    </div>
  );
}
