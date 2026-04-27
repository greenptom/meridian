"use client";

import { formatCurrency } from "@/lib/utils";
import type { ExposureKpis } from "@/lib/exposure";

export function ExposureKpiStrip({
  kpis,
  totalShipments,
}: {
  kpis: ExposureKpis;
  totalShipments: number;
}) {
  const items = [
    {
      label: "Total exposure",
      value: formatCurrency(kpis.totalExposureGbp, "GBP"),
      meta: `${totalShipments} shipment${totalShipments === 1 ? "" : "s"} in window`,
    },
    {
      label: "Jurisdictions with shipments",
      value: String(kpis.jurisdictionsWithShipments),
      meta: "registered or unregistered",
    },
    {
      label: "Flagged shipments",
      value: String(kpis.flaggedShipments),
      meta: kpis.flaggedShipments > 0 ? "require attention" : "all clear",
      alert: kpis.flaggedShipments > 0,
    },
    {
      label: "Unregistered destinations",
      value: String(kpis.unregisteredDestinations),
      meta:
        kpis.unregisteredDestinations > 0
          ? "no active VAT registration"
          : "all destinations covered",
      alert: kpis.unregisteredDestinations > 0,
    },
  ];

  return (
    <div
      className="grid grid-cols-4 max-[1100px]:grid-cols-2 gap-px rounded-[10px] overflow-hidden mb-8 border"
      style={{
        background: "var(--color-line)",
        borderColor: "var(--color-line)",
      }}
    >
      {items.map((k, i) => (
        <div
          key={k.label}
          className="p-5 px-[22px] flex flex-col gap-1.5"
          style={{
            background: "var(--color-card)",
            animation: `fadeUp 0.5s cubic-bezier(.2,.9,.25,1.05) both`,
            animationDelay: `${0.05 * (i + 1)}s`,
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
            {k.label}
          </div>
          <div
            className="font-serif text-[34px] leading-[1.1] tracking-tight"
            style={{
              color: k.alert ? "var(--color-accent)" : "var(--color-ink)",
            }}
          >
            {k.value}
          </div>
          <div className="text-[12px] text-[color:var(--color-ink-soft)]">
            {k.meta}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
