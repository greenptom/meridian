"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TimeWindowSelector } from "@/components/ui/time-window-selector";
import { ExposureKpiStrip } from "./exposure-kpis";
import { JurisdictionGrid } from "./jurisdiction-grid";
import {
  serializeTimeWindowParams,
  type TimeWindowSelection,
} from "@/lib/time-window";
import type { ExposureKpis, ExposureRow } from "@/lib/exposure";

export function ExposureView({
  rows,
  kpis,
  totalShipments,
  windowLabel,
  selection,
  years,
  includeArchived,
}: {
  rows: ExposureRow[];
  kpis: ExposureKpis;
  totalShipments: number;
  windowLabel: string;
  selection: TimeWindowSelection;
  years: number[];
  includeArchived: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function toggleArchived() {
    const next = new URLSearchParams(searchParams);
    if (includeArchived) {
      next.set("archived", "0");
    } else {
      next.delete("archived");
    }
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  // Build the click-through URL: /shipments with destination + the
  // current time window (so the count carries through verbatim).
  function shipmentsHref(countryCode: string): string {
    const tw = serializeTimeWindowParams(selection);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(tw)) params.set(k, v);
    params.set("destination", countryCode);
    return `/shipments?${params.toString()}`;
  }

  return (
    <div>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-4"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            Tax <em className="text-[color:var(--color-ink-soft)]">exposure</em>
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {windowLabel} · {totalShipments} shipment
            {totalShipments === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 max-[900px]:items-start">
          <TimeWindowSelector years={years} />
          <button
            type="button"
            onClick={toggleArchived}
            disabled={isPending}
            className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] flex items-center gap-1.5"
          >
            <span
              className="inline-block w-3 h-3 rounded-sm border"
              style={{
                borderColor: "var(--color-line)",
                background: includeArchived
                  ? "var(--color-ink)"
                  : "transparent",
              }}
            />
            Include archived shipments
          </button>
        </div>
      </header>

      <ExposureKpiStrip kpis={kpis} totalShipments={totalShipments} />

      <JurisdictionGrid rows={rows} shipmentsHref={shipmentsHref} />

      <div
        className="text-[11px] text-[color:var(--color-ink-faint)] mt-3 leading-relaxed"
        style={{ maxWidth: "60ch" }}
      >
        Shipments with pending FX rates (source · needs review) are
        excluded from exposure totals but still appear in shipment counts
        and flag counts. Set a manual rate or wait for the next
        Frankfurter sync to bring them into the totals.
      </div>
    </div>
  );
}
