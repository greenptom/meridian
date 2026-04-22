"use client";

import { useState, useMemo } from "react";
import type {
  Shipment,
  ShipmentDocument,
  ShipmentEvent,
  ShipmentCategory,
} from "@/lib/types";
import {
  SHIPMENT_CATEGORIES,
  SHIPMENT_CATEGORY_LABELS,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { isUK } from "@/lib/countries";
import { ShipmentDetail } from "./shipment-detail";

type StatusFilter = "all" | "import" | "export" | "flagged" | "draft";
type CategoryFilter = "all" | ShipmentCategory;

const STATUS_FILTERS: StatusFilter[] = [
  "all",
  "import",
  "export",
  "flagged",
  "draft",
];

const CATEGORY_FILTERS: CategoryFilter[] = ["all", ...SHIPMENT_CATEGORIES];

function matchesStatus(s: Shipment, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "flagged")
    return s.status === "alert" || s.status === "review";
  if (filter === "draft") return s.status === "draft";
  if (filter === "import") return isUK(s.destination_country);
  if (filter === "export")
    return isUK(s.origin_country) && !isUK(s.destination_country);
  return true;
}

function matchesCategory(s: Shipment, filter: CategoryFilter): boolean {
  if (filter === "all") return true;
  return s.shipment_category === filter;
}

const statusLabel: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  review: "Review",
  alert: "Flag",
  archived: "Archived",
};

export function ShipmentsTable({
  shipments,
  documentsByShipment,
  eventsByShipment,
  onEdit,
  hideFilters = false,
}: {
  shipments: Shipment[];
  documentsByShipment: Map<string, ShipmentDocument[]>;
  eventsByShipment: Map<string, ShipmentEvent[]>;
  onEdit: (s: Shipment, focusField?: string) => void;
  hideFilters?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(shipments[0]?.id ?? null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const filtered = useMemo(
    () =>
      shipments.filter(
        (s) =>
          matchesStatus(s, statusFilter) && matchesCategory(s, categoryFilter),
      ),
    [shipments, statusFilter, categoryFilter],
  );

  const selected = shipments.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="grid grid-cols-[1fr_340px] max-[1100px]:grid-cols-1 gap-6">
      <section
        className="rounded-[10px] border overflow-hidden"
        style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
      >
        <div
          className="flex justify-between items-center px-[22px] py-4 border-b"
          style={{ borderColor: "var(--color-line-soft)" }}
        >
          <div className="font-serif text-[20px] font-medium tracking-tight">
            Recent <em className="text-[color:var(--color-ink-soft)] font-normal">shipments</em>
          </div>
        </div>

        {!hideFilters && (
          <div
            className="flex gap-3 flex-wrap items-center px-[22px] py-3 border-b"
            style={{
              background: "var(--color-paper-warm)",
              borderColor: "var(--color-line-soft)",
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-[color:var(--color-ink-faint)]">
                Show:
              </span>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "font-mono text-[11px] px-2.5 py-1 rounded border tracking-wide capitalize",
                    statusFilter === f
                      ? "bg-[color:var(--color-ink)] text-[color:var(--color-paper)] border-[color:var(--color-ink)]"
                      : "bg-white text-[color:var(--color-ink-soft)] border-[color:var(--color-line)] hover:border-[color:var(--color-ink)]"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <span
              className="inline-block w-px h-5"
              style={{ background: "var(--color-line)" }}
              aria-hidden
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-[color:var(--color-ink-faint)]">
                Category:
              </span>
              {CATEGORY_FILTERS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className={cn(
                    "font-mono text-[11px] px-2.5 py-1 rounded border tracking-wide",
                    c === "all" && "capitalize",
                    categoryFilter === c
                      ? "bg-[color:var(--color-ink)] text-[color:var(--color-paper)] border-[color:var(--color-ink)]"
                      : "bg-white text-[color:var(--color-ink-soft)] border-[color:var(--color-line)] hover:border-[color:var(--color-ink)]"
                  )}
                >
                  {c === "all" ? "all" : SHIPMENT_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="font-serif text-[22px] italic text-[color:var(--color-ink-soft)] mb-2">
              Nothing here yet
            </div>
            <div className="text-[13px] text-[color:var(--color-ink-faint)]">
              Log your first movement to see it appear.
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Ref", "Route", "Commodity", "Term", "Status"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-[color:var(--color-ink-faint)] border-b"
                    style={{
                      background: "var(--color-paper-warm)",
                      borderColor: "var(--color-line)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedId === s.id && "bg-[#fdfaf3] shadow-[inset_3px_0_0_var(--color-accent)]"
                  )}
                  style={{
                    borderBottom: "1px solid var(--color-line-soft)",
                  }}
                >
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-[12px] text-[color:var(--color-ink-soft)]">
                      {s.ref}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 font-medium">
                      {s.origin_country ?? "—"}
                      <span className="text-[color:var(--color-ink-faint)] text-[11px]">→</span>
                      {s.destination_country ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">{s.product_type ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    {s.incoterm && <span className="incoterm">{s.incoterm}</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`status status-${s.status}`}>
                        {statusLabel[s.status] ?? s.status}
                      </span>
                      {s.actual_landed_date && (
                        <span className="font-mono text-[9px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
                          landed
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <ShipmentDetail
          key={selected.id}
          shipment={selected}
          documents={documentsByShipment.get(selected.id) ?? []}
          events={eventsByShipment.get(selected.id) ?? []}
          onEdit={(focus) => onEdit(selected, focus)}
        />
      )}
    </div>
  );
}
