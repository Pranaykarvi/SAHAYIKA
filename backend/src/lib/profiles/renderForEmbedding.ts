import type { CapacityItem } from "../../validation/capability-profiles";

// THE single canonical rendering of a capability profile for embedding —
// the counterpart of lib/opportunities/renderForEmbedding. The seed and the
// profile-save path both embed exactly this text; change it and every stored
// profile embedding is stale.
export function renderProfileForEmbedding(profile: {
  skills: string[];
  capacity: CapacityItem[];
  equipment: string[];
}): string {
  const capacityText = profile.capacity
    .map(
      (item) =>
        `${item.product}, up to ${item.unitsPerMonth} per month, lead time ${item.minLeadTimeDays} days`,
    )
    .join("; ");
  return [
    `Skills: ${profile.skills.join(", ")}.`,
    `Capacity: ${capacityText || "none profiled"}.`,
    `Equipment: ${profile.equipment.join(", ") || "none"}.`,
  ].join(" ");
}
