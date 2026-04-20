import { formatCurrency } from "@/lib/utils";
import type { Shipment } from "@/lib/types";

export function KpiStrip({ shipments }: { shipments: Shipment[] }) {
  const active = shipments.filter((s) => s.status === "active").length;
  const flagged = shipments.filter((s) => s.status === "alert" || (s.flags && s.flags.length > 0)).length;
  const totalValue = shipments
    .filter((s) => s.status === "active" && s.invoice_value)
    .reduce((sum, s) => sum + (s.invoice_value ?? 0), 0);
  const jurisdictions = new Set(
    shipments.map((s) => s.destination_country).filter(Boolean)
  ).size;

  const kpis = [
    { label: "Active shipments", value: String(active), meta: `${shipments.length} total` },
    { label: "In-transit value", value: formatCurrency(totalValue, "GBP"), meta: "across active" },
    { label: "Tax flags", value: String(flagged), meta: flagged > 0 ? "require review" : "all clear", alert: flagged > 0 },
    { label: "Jurisdictions", value: String(jurisdictions), meta: "destination countries" },
  ];

  return (
    <div
      className="grid grid-cols-4 max-[1100px]:grid-cols-2 gap-px rounded-[10px] overflow-hidden mb-8 border"
      style={{ background: "var(--color-line)", borderColor: "var(--color-line)" }}
    >
      {kpis.map((k, i) => (
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
            style={{ color: k.alert ? "var(--color-accent)" : "var(--color-ink)" }}
          >
            {k.value}
          </div>
          <div className="text-[12px] text-[color:var(--color-ink-soft)]">{k.meta}</div>
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
