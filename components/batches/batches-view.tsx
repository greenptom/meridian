"use client";

import { useMemo, useState } from "react";
import type { BatchWithSummary, EligibleSource } from "@/lib/actions/batches";
import { BatchesTable } from "./batches-table";
import { AddBatchModal } from "./add-batch-modal";

export function BatchesView({
  batches,
  eligibleSources,
}: {
  batches: BatchWithSummary[];
  eligibleSources: EligibleSource[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [blendFilter, setBlendFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    const needle = blendFilter.trim().toLowerCase();
    return batches.filter((b) => {
      if (needle) {
        const hay = (b.blend_name ?? "").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (fromDate && (!b.roasted_date || b.roasted_date < fromDate)) {
        return false;
      }
      if (toDate && (!b.roasted_date || b.roasted_date > toDate)) {
        return false;
      }
      return true;
    });
  }, [batches, blendFilter, fromDate, toDate]);

  return (
    <>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-4"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            Production <em className="text-[color:var(--color-ink-soft)]">batches</em>
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {batches.length} total · {eligibleSources.length} shipments with stock remaining
          </div>
        </div>
        <div>
          <button
            className="btn btn-primary"
            onClick={() => setModalOpen(true)}
            disabled={eligibleSources.length === 0}
            title={
              eligibleSources.length === 0
                ? "Log a shipment with quantity first"
                : undefined
            }
          >
            <span className="text-lg leading-none">+</span> Add batch
          </button>
        </div>
      </header>

      <section
        className="rounded-[10px] border overflow-hidden"
        style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
      >
        <div
          className="flex justify-between items-center px-[22px] py-4 border-b gap-4 flex-wrap"
          style={{ borderColor: "var(--color-line-soft)" }}
        >
          <div className="font-serif text-[20px] font-medium tracking-tight">
            All <em className="text-[color:var(--color-ink-soft)] font-normal">batches</em>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              placeholder="Filter by blend…"
              className="form-input-sm"
              value={blendFilter}
              onChange={(e) => setBlendFilter(e.target.value)}
            />
            <input
              type="date"
              className="form-input-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="Roasted from"
            />
            <span className="text-[color:var(--color-ink-faint)] text-[11px]">→</span>
            <input
              type="date"
              className="form-input-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="Roasted to"
            />
          </div>
        </div>

        <BatchesTable batches={filtered} />
      </section>

      <AddBatchModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eligibleSources={eligibleSources}
      />

      <style>{`
        .form-input-sm {
          font-family: var(--font-sans);
          font-size: 12px;
          padding: 6px 10px;
          border: 1px solid var(--color-line);
          border-radius: 6px;
          background: var(--color-card);
          color: var(--color-ink);
          transition: border-color 0.15s, background 0.15s;
        }
        .form-input-sm:focus {
          outline: none;
          border-color: var(--color-ink);
          box-shadow: 0 0 0 3px rgba(20,15,5,0.05);
        }
      `}</style>
    </>
  );
}
