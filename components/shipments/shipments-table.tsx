"use client";

import { useState, useMemo } from "react";
import type {
  Shipment,
  ShipmentDocument,
  ShipmentEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { ShipmentDetail } from "./shipment-detail";

type Filter = "all" | "import" | "export" | "flagged" | "draft";

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
  onEdit: (s: Shipment) => void;
  hideFilters?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(shipments[0]?.id ?? null);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return shipments;
    if (filter === "flagged")
      return shipments.filter((s) => s.status === "alert" || s.status === "review");
    if (filter === "draft") return shipments.filter((s) => s.status === "draft");
    if (filter === "import")
      return shipments.filter((s) => s.destination_country === "United Kingdom");
    if (filter === "export")
      return shipments.filter(
        (s) => s.origin_country === "United Kingdom" && s.destination_country !== "United Kingdom"
      );
    return shipments;
  }, [shipments, filter]);

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
            className="flex gap-2 flex-wrap px-[22px] py-3 border-b"
            style={{
              background: "var(--color-paper-warm)",
              borderColor: "var(--color-line-soft)",
            }}
          >
            {(["all", "import", "export", "flagged", "draft"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "font-mono text-[11px] px-2.5 py-1 rounded border tracking-wide capitalize",
                  filter === f
                    ? "bg-[color:var(--color-ink)] text-[color:var(--color-paper)] border-[color:var(--color-ink)]"
                    : "bg-white text-[color:var(--color-ink-soft)] border-[color:var(--color-line)] hover:border-[color:var(--color-ink)]"
                )}
              >
                {f}
              </button>
            ))}
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
          onEdit={() => onEdit(selected)}
        />
      )}
    </div>
  );
}
