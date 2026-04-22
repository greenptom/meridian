"use client";

import Link from "next/link";
import type { BatchWithSummary } from "@/lib/actions/batches";
import { formatCurrency } from "@/lib/utils";

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function BatchesTable({ batches }: { batches: BatchWithSummary[] }) {
  if (batches.length === 0) {
    return (
      <div className="p-16 text-center">
        <div className="font-serif text-[22px] italic text-[color:var(--color-ink-soft)] mb-2">
          No batches yet
        </div>
        <div className="text-[13px] text-[color:var(--color-ink-faint)]">
          Add a batch to record the shipments blended into a production run.
        </div>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {["Code", "Blend", "Roasted", "Produced", "Sources", "Blended / unit"].map(
            (h) => (
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
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {batches.map((b) => (
          <tr
            key={b.id}
            style={{ borderBottom: "1px solid var(--color-line-soft)" }}
            className="hover:bg-[#fdfaf3] transition-colors"
          >
            <td className="px-4 py-3.5">
              <Link
                href={`/batches/${encodeURIComponent(b.batch_code)}`}
                className="font-mono text-[12px] text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)] hover:underline"
              >
                {b.batch_code}
              </Link>
            </td>
            <td className="px-4 py-3.5 font-medium">{b.blend_name ?? "—"}</td>
            <td className="px-4 py-3.5">{formatDateOnly(b.roasted_date)}</td>
            <td className="px-4 py-3.5">
              {b.quantity_produced != null
                ? `${b.quantity_produced} ${b.quantity_unit}`
                : "—"}
            </td>
            <td className="px-4 py-3.5">{b.source_count}</td>
            <td className="px-4 py-3.5">
              {b.blended_cost != null ? (
                <span className="font-mono text-[12px]">
                  {formatCurrency(b.blended_cost, "GBP", 4)}
                </span>
              ) : (
                <span
                  className="text-[color:var(--color-ink-faint)]"
                  title="Pending landed costs on one or more source shipments"
                >
                  —
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
