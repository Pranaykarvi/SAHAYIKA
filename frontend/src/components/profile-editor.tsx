"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, browserApi, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Profile = components["schemas"]["CapabilityProfile"];
type UpsertRequest = components["schemas"]["CapabilityProfileUpsertRequest"];

interface CapacityDraft {
  product: string;
  unitsPerMonth: string;
  minLeadTimeDays: string;
}

// Single-column editor sized for a shared phone: large touch targets,
// generous type, no hover-dependent interaction. Saving re-embeds on the
// backend; the phone never computes anything.
export function ProfileEditor({
  groupId,
  initial,
}: {
  groupId: string;
  initial: Profile | null;
}) {
  const router = useRouter();
  const [skills, setSkills] = useState(initial?.skills.join(", ") ?? "");
  const [equipment, setEquipment] = useState(
    initial?.equipment.join(", ") ?? "",
  );
  const [certifications, setCertifications] = useState(
    initial?.certifications.map((c) => c.name).join("; ") ?? "",
  );
  const [capacity, setCapacity] = useState<CapacityDraft[]>(
    initial?.capacity.map((c) => ({
      product: c.product,
      unitsPerMonth: String(c.unitsPerMonth),
      minLeadTimeDays: String(c.minLeadTimeDays),
    })) ?? [{ product: "", unitsPerMonth: "", minLeadTimeDays: "" }],
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input =
    "w-full rounded-md border bg-background px-4 py-3 text-base";

  function setCapacityRow(index: number, patch: Partial<CapacityDraft>) {
    setCapacity((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function buildPayload(): UpsertRequest | string {
    const rows = capacity
      .filter((row) => row.product.trim())
      .map((row) => ({
        product: row.product.trim(),
        unitsPerMonth: Number(row.unitsPerMonth),
        minLeadTimeDays: Number(row.minLeadTimeDays),
      }));
    for (const row of rows) {
      if (!(row.unitsPerMonth > 0) || !(row.minLeadTimeDays >= 0)) {
        return "Each product needs how many the group can make per month and the days needed before delivery.";
      }
    }
    return {
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      equipment: equipment.split(",").map((s) => s.trim()).filter(Boolean),
      certifications: certifications
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name })),
      capacity: rows,
    };
  }

  async function save() {
    const payload = buildPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      unwrap(
        await browserApi().PUT("/groups/{id}/profile", {
          params: { path: { id: groupId } },
          body: payload,
        }),
      );
      setMessage("Profile saved.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The profile was not saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <label className="block space-y-1.5">
        <span className="text-base font-medium">
          Skills <span className="font-normal text-muted-foreground">(separate with commas)</span>
        </span>
        <input className={input} value={skills} onChange={(e) => setSkills(e.target.value)} />
      </label>

      <div className="space-y-2">
        <p className="text-base font-medium">What the group can make</p>
        {capacity.map((row, index) => (
          <div key={index} className="space-y-2 rounded-md border p-3">
            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">Product</span>
              <input className={input} value={row.product} onChange={(e) => setCapacityRow(index, { product: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1.5">
                <span className="text-sm text-muted-foreground">Per month</span>
                <input className={input} inputMode="numeric" value={row.unitsPerMonth} onChange={(e) => setCapacityRow(index, { unitsPerMonth: e.target.value })} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-muted-foreground">Days needed</span>
                <input className={input} inputMode="numeric" value={row.minLeadTimeDays} onChange={(e) => setCapacityRow(index, { minLeadTimeDays: e.target.value })} />
              </label>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() =>
            setCapacity((rows) => [
              ...rows,
              { product: "", unitsPerMonth: "", minLeadTimeDays: "" },
            ])
          }
        >
          Add another product
        </Button>
      </div>

      <label className="block space-y-1.5">
        <span className="text-base font-medium">
          Equipment <span className="font-normal text-muted-foreground">(separate with commas)</span>
        </span>
        <input className={input} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-base font-medium">
          Certificates <span className="font-normal text-muted-foreground">(separate with “;”)</span>
        </span>
        <input className={input} value={certifications} onChange={(e) => setCertifications(e.target.value)} />
      </label>

      {error ? <p className="text-base text-destructive">{error}</p> : null}
      {message ? <p className="text-base text-green-700 dark:text-green-400">{message}</p> : null}
      <Button className="h-14 w-full text-lg" disabled={pending} onClick={save}>
        {pending ? "Saving… please wait" : "Save profile"}
      </Button>
    </div>
  );
}
