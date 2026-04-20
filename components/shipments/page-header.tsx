"use client";

import { useState } from "react";
import { IntakeModal } from "./intake-modal";
import type { Incoterm, CommodityCode } from "@/lib/types";

export function ShipmentsPageHeader({
  activeCount,
  flaggedCount,
  incoterms,
  commodityCodes,
}: {
  activeCount: number;
  flaggedCount: number;
  incoterms: Incoterm[];
  commodityCodes: CommodityCode[];
}) {
  const [open, setOpen] = useState(false);

  const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-4"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            Stock <em className="text-[color:var(--color-ink-soft)]">movements</em>
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {monthLabel} · {activeCount} active · {flaggedCount} flagged
          </div>
        </div>
        <div className="flex gap-2.5">
          <button className="btn" disabled title="Phase 4">
            <span>Export to Excel</span>
          </button>
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <span className="text-lg leading-none">+</span> Log movement
          </button>
        </div>
      </header>

      <IntakeModal
        open={open}
        onClose={() => setOpen(false)}
        incoterms={incoterms}
        commodityCodes={commodityCodes}
      />
    </>
  );
}
