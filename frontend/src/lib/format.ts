// Display helpers. Dates render the ISO date itself (stable across server
// and client); money renders in Indian grouping.
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function fmtMoney(amount: string | number): string {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

export function fmtBand(band: string): string {
  return band.replace("_", " ");
}

export function daysUntil(isoDate: string): number {
  return Math.ceil((Date.parse(isoDate) - Date.now()) / 86_400_000);
}
