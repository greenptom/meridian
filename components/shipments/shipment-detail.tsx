"use client";

import type { Shipment } from "@/lib/types";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  review: "Review",
  alert: "Flag",
  archived: "Archived",
};

export function ShipmentDetail({ shipment: s }: { shipment: Shipment }) {
  return (
    <aside
      className="rounded-[10px] border overflow-y-auto sticky top-6 self-start max-h-[calc(100vh-48px)] max-[1100px]:static max-[1100px]:max-h-none"
      style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
    >
      <header
        className="px-[22px] pt-[22px] pb-[18px] border-b"
        style={{ borderColor: "var(--color-line-soft)" }}
      >
        <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] tracking-wider">
          {s.ref} · {formatDate(s.created_at)}
        </div>
        <div className="font-serif text-[22px] font-medium tracking-tight mt-1 leading-snug">
          {s.origin_country ?? "Unknown"}
          <br />
          <span className="text-[color:var(--color-ink-soft)]">→ {s.destination_country ?? "Unknown"}</span>
        </div>
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          <span className={`status status-${s.status}`}>{statusLabel[s.status] ?? s.status}</span>
          {s.incoterm && <span className="incoterm">{s.incoterm}</span>}
        </div>
      </header>

      <Section label="Movement details">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
          <Field label="Origin" value={s.origin_country} />
          <Field label="Destination" value={s.destination_country} />
          <Field label="Supplier" value={s.supplier_name} />
          <Field label="Haulier" value={s.haulier_name} />
          <Field label="Commodity" value={s.commodity_code} mono />
          <Field label="Product" value={s.product_type} />
          <Field label="Invoice value" value={formatCurrency(s.invoice_value, s.currency)} />
          <Field label="IOR" value={s.ior_name} />
        </div>
      </Section>

      {s.reason && (
        <Section label="Reason">
          <div className="text-[13px] leading-relaxed">{s.reason}</div>
        </Section>
      )}

      {s.flags && s.flags.length > 0 && (
        <Section label="Flags">
          <div className="flex flex-col gap-2">
            {s.flags.map((f) => (
              <div
                key={f}
                className="text-[12px] px-3 py-2 rounded font-mono"
                style={{
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                }}
              >
                {f.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section label="Documents">
        <div
          className="text-[12px] text-[color:var(--color-ink-faint)] italic px-3 py-6 text-center rounded border border-dashed"
          style={{ borderColor: "var(--color-line)" }}
        >
          Document upload arrives in Phase 2
        </div>
      </Section>

      <Section label="Activity">
        <div className="flex flex-col gap-3.5">
          <Event title="Shipment created" meta={`${formatDateShort(s.created_at)} · ${new Date(s.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`} current />
          {s.updated_at !== s.created_at && (
            <Event title="Last updated" meta={formatDateShort(s.updated_at)} />
          )}
        </div>
      </Section>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="px-[22px] py-[18px] border-b last:border-b-0"
      style={{ borderColor: "var(--color-line-soft)" }}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mb-3">
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[color:var(--color-ink-faint)]">{label}</span>
      <span className={`text-[13px] ${mono ? "font-mono text-[12px]" : "font-medium"}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function Event({ title, meta, current = false }: { title: string; meta: string; current?: boolean }) {
  return (
    <div className="flex gap-3 relative">
      <div
        className="w-[11px] h-[11px] rounded-full border-2 mt-0.5 shrink-0 z-10"
        style={{
          background: current ? "var(--color-accent)" : "var(--color-card)",
          borderColor: current ? "var(--color-accent)" : "var(--color-ink-faint)",
        }}
      />
      <div className="flex-1">
        <div className="text-[12.5px] font-medium">{title}</div>
        <div className="text-[11px] font-mono text-[color:var(--color-ink-faint)] mt-0.5">{meta}</div>
      </div>
    </div>
  );
}
