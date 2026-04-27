"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import {
  JURISDICTION_STATUS_LABELS,
  type JurisdictionStatus,
} from "@/lib/types";
import { flagEmoji, type ExposureRow } from "@/lib/exposure";

const STATUS_LABELS: Record<JurisdictionStatus | "no_registration", string> = {
  ...JURISDICTION_STATUS_LABELS,
  no_registration: "No registration",
};

function pillClass(status: JurisdictionStatus | "no_registration"): string {
  switch (status) {
    case "active":
      return "status status-active";
    case "query_on_hold":
      return "status status-review";
    case "not_registered":
    case "no_registration":
      return "status status-archived";
  }
}

export function JurisdictionGrid({
  rows,
  shipmentsHref,
}: {
  rows: ExposureRow[];
  // Caller provides a function that turns a country code into the
  // pre-filtered /shipments URL (preserving time window).
  shipmentsHref: (countryCode: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="text-[13px] text-[color:var(--color-ink-faint)] italic px-4 py-12 text-center rounded border border-dashed"
        style={{ borderColor: "var(--color-line)" }}
      >
        No jurisdictions to show in this window.
      </div>
    );
  }
  return (
    <div
      className="rounded-[10px] border overflow-hidden"
      style={{
        background: "var(--color-card)",
        borderColor: "var(--color-line)",
      }}
    >
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {["Jurisdiction", "Status", "Shipments", "Total exposure", "Flags"].map(
              (h, i) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-[color:var(--color-ink-faint)] border-b"
                  style={{
                    background: "var(--color-paper-warm)",
                    borderColor: "var(--color-line)",
                    textAlign:
                      i === 2 || i === 3 || i === 4 ? "right" : "left",
                  }}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const flag = flagEmoji(r.countryCode);
            return (
              <tr
                key={r.countryCode}
                className="hover:bg-[color:var(--color-paper-warm)] cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid var(--color-line-soft)" }}
              >
                <td className="px-4 py-3.5">
                  <Link
                    href={shipmentsHref(r.countryCode)}
                    className="flex items-center gap-2 hover:underline"
                  >
                    {flag && (
                      <span className="text-[16px] leading-none">{flag}</span>
                    )}
                    <span className="font-mono font-medium">
                      {r.countryCode}
                    </span>
                    <span className="text-[color:var(--color-ink-soft)]">
                      · {r.countryName}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <span className={pillClass(r.pillStatus)}>
                    {STATUS_LABELS[r.pillStatus]}
                  </span>
                </td>
                <td
                  className="px-4 py-3.5 font-mono text-[12px]"
                  style={{ textAlign: "right" }}
                >
                  {r.shipmentCount === 0 ? (
                    <span className="text-[color:var(--color-ink-faint)]">—</span>
                  ) : (
                    r.shipmentCount
                  )}
                </td>
                <td
                  className="px-4 py-3.5 font-mono"
                  style={{ textAlign: "right" }}
                >
                  {r.totalLandedGbp > 0 ? (
                    formatCurrency(r.totalLandedGbp, "GBP")
                  ) : (
                    <span className="text-[color:var(--color-ink-faint)]">
                      —
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5" style={{ textAlign: "right" }}>
                  {r.flagCount > 0 ? (
                    <span
                      className="font-mono text-[11px] uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{
                        background: "var(--color-accent-soft)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {r.flagCount} flagged
                    </span>
                  ) : (
                    <span className="text-[color:var(--color-ink-faint)]">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
