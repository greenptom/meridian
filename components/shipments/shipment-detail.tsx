"use client";

import { useState } from "react";
import type {
  Shipment,
  ShipmentDocument,
  ShipmentEvent,
  ShipmentStatus,
} from "@/lib/types";
import { SHIPMENT_CATEGORY_LABELS, FX_RATE_SOURCE_LABELS } from "@/lib/types";
import { getSignedDocumentUrl } from "@/lib/actions/documents";
import { formatCurrency } from "@/lib/utils";
import { ClientTime } from "@/components/ui/client-time";
import { MarkLandedModal } from "./mark-landed-modal";

const statusLabel: Record<ShipmentStatus, string> = {
  active: "Active",
  draft: "Draft",
  review: "Review",
  alert: "Flag",
  archived: "Archived",
};

const EVENT_LABEL: Record<ShipmentEvent["type"], string> = {
  created: "Shipment created",
  updated: "Shipment updated",
  status_changed: "Status changed",
  document_attached: "Document attached",
  document_extracted: "Document extracted",
  note_added: "Note added",
  landed: "Landed",
  customs_cleared: "Customs cleared",
  customs_held: "Customs held",
};

export function ShipmentDetail({
  shipment: s,
  documents,
  events,
  onEdit,
}: {
  shipment: Shipment;
  documents: ShipmentDocument[];
  events: ShipmentEvent[];
  onEdit: (focusField?: string) => void;
}) {
  const [landedOpen, setLandedOpen] = useState(false);
  const canMarkLanded = s.status === "active" && !s.actual_landed_date;

  return (
    <aside
      className="rounded-[10px] border overflow-y-auto sticky top-6 self-start max-h-[calc(100vh-48px)] max-[1100px]:static max-[1100px]:max-h-none"
      style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
    >
      <header
        className="px-[22px] pt-[22px] pb-[18px] border-b"
        style={{ borderColor: "var(--color-line-soft)" }}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] tracking-wider">
            {s.ref} · <ClientTime iso={s.created_at} mode="date" />
          </div>
          <div className="flex gap-2">
            {canMarkLanded && (
              <button
                onClick={() => setLandedOpen(true)}
                className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                style={{
                  background: "var(--color-ink)",
                  color: "var(--color-paper)",
                }}
              >
                Mark as landed
              </button>
            )}
            <button
              onClick={() => onEdit()}
              className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border hover:bg-[color:var(--color-paper-warm)]"
              style={{ borderColor: "var(--color-line)" }}
            >
              Edit
            </button>
          </div>
        </div>
        <div className="font-serif text-[22px] font-medium tracking-tight mt-1 leading-snug">
          {s.origin_country ?? "Unknown"}
          <br />
          <span className="text-[color:var(--color-ink-soft)]">→ {s.destination_country ?? "Unknown"}</span>
        </div>
        <div className="flex gap-2 mt-2.5 items-center flex-wrap">
          <span className={`status status-${s.status}`}>
            {statusLabel[s.status] ?? s.status}
          </span>
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
          <Field
            label="Category"
            value={
              s.shipment_category
                ? SHIPMENT_CATEGORY_LABELS[s.shipment_category]
                : null
            }
            nullAction={{
              label: "Set a category",
              onClick: () => onEdit("shipment_category"),
            }}
          />
          <Field label="Product" value={s.product_type} />
          <Field
            label="Invoice value"
            value={formatCurrency(s.invoice_value, s.currency)}
            subscript={renderFxSubscript(s, () => onEdit("fx_rate_to_gbp"))}
          />
          <Field label="IOR" value={s.ior_name} />
        </div>
      </Section>

      <Section label="Landing & costs">
        <LandingAndCosts shipment={s} />
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
        <DocumentsList documents={documents} />
      </Section>

      <Section label="Activity">
        <ActivityList shipment={s} events={events} />
      </Section>

      <MarkLandedModal
        shipment={s}
        open={landedOpen}
        onClose={() => setLandedOpen(false)}
        onRequestEditQuantity={() => onEdit("quantity")}
      />
    </aside>
  );
}

const CUSTOMS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  cleared: "Cleared",
  held: "Held",
};

function LandingAndCosts({ shipment: s }: { shipment: Shipment }) {
  const { totalLanded, perUnit } = computeLandedCost(s);

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
        <Field label="PO number" value={s.po_number} mono />
        <Field
          label="Quantity"
          value={
            s.quantity != null
              ? `${s.quantity}${s.quantity_unit ? ` ${s.quantity_unit}` : ""}`
              : null
          }
        />
        <Field label="Expected landed" value={formatDateOnly(s.expected_landed_date)} />
        <Field label="Actual landed" value={formatDateOnly(s.actual_landed_date)} />
        <Field
          label="Customs"
          value={s.customs_status ? CUSTOMS_LABEL[s.customs_status] : null}
        />
        <Field
          label="Freight"
          value={formatCurrency(s.freight_cost, s.currency)}
        />
        <Field
          label="Insurance"
          value={formatCurrency(s.insurance_cost, s.currency)}
        />
        <Field label="Duty" value={formatCurrency(s.duty_cost, s.currency)} />
        <Field
          label="Other"
          value={formatCurrency(s.other_costs, s.currency)}
        />
      </div>
      {(totalLanded !== null || perUnit !== null) && (
        <div
          className="mt-4 pt-3 border-t flex flex-col gap-1.5"
          style={{ borderColor: "var(--color-line-soft)" }}
        >
          {totalLanded !== null && (
            <div className="flex justify-between items-baseline">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
                Total landed
              </span>
              <span className="font-serif text-[16px]">
                {formatCurrency(totalLanded, s.currency)}
              </span>
            </div>
          )}
          {perUnit !== null && (
            <div className="flex justify-between items-baseline">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
                Per {s.quantity_unit}
              </span>
              <span className="font-mono text-[12px]">
                {formatCurrency(perUnit, s.currency, 4)}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function computeLandedCost(s: Shipment): {
  totalLanded: number | null;
  perUnit: number | null;
} {
  if (s.invoice_value == null) return { totalLanded: null, perUnit: null };
  const total =
    s.invoice_value +
    (s.freight_cost ?? 0) +
    (s.insurance_cost ?? 0) +
    (s.duty_cost ?? 0) +
    (s.other_costs ?? 0);
  const perUnit =
    s.quantity && s.quantity > 0 ? total / s.quantity : null;
  return { totalLanded: total, perUnit };
}

function formatDateOnly(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function DocumentsList({ documents }: { documents: ShipmentDocument[] }) {
  if (documents.length === 0) {
    return (
      <div
        className="text-[12px] text-[color:var(--color-ink-faint)] italic px-3 py-6 text-center rounded border border-dashed"
        style={{ borderColor: "var(--color-line)" }}
      >
        No documents attached
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.map((d) => (
        <DocumentRow key={d.id} document={d} />
      ))}
    </div>
  );
}

function DocumentRow({ document: d }: { document: ShipmentDocument }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setError(null);
    setOpening(true);
    const result = await getSignedDocumentUrl(d.id);
    setOpening(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  const confidencePct =
    typeof d.extraction_confidence === "number"
      ? `${Math.round(d.extraction_confidence * 100)}%`
      : null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded border"
      style={{
        background: "var(--color-paper-warm)",
        borderColor: "var(--color-line-soft)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium truncate">
          {d.filename ?? "Untitled document"}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-0.5">
          <ClientTime iso={d.created_at} mode="dateShort" />
          {confidencePct && <> · {confidencePct} confidence</>}
        </div>
        {error && (
          <div
            className="font-mono text-[10px] mt-1"
            style={{ color: "var(--color-accent)" }}
          >
            {error}
          </div>
        )}
      </div>
      <button
        onClick={handleOpen}
        disabled={opening}
        className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border bg-white hover:bg-[color:var(--color-paper-warm)]"
        style={{ borderColor: "var(--color-line)" }}
      >
        {opening ? "Opening…" : "View"}
      </button>
    </div>
  );
}

function ActivityList({
  shipment,
  events,
}: {
  shipment: Shipment;
  events: ShipmentEvent[];
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <Event
          title="Shipment created"
          metaIso={shipment.created_at}
          current
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {events.map((e, i) => (
        <Event
          key={e.id}
          title={e.summary ?? EVENT_LABEL[e.type]}
          metaIso={e.created_at}
          current={i === 0}
        />
      ))}
    </div>
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
  nullAction,
  subscript,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  nullAction?: { label: string; onClick: () => void };
  subscript?: React.ReactNode;
}) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[color:var(--color-ink-faint)]">{label}</span>
      <span className={`text-[13px] ${mono ? "font-mono text-[12px]" : "font-medium"}`}>
        {!isEmpty ? (
          value
        ) : nullAction ? (
          <button
            type="button"
            onClick={nullAction.onClick}
            className="text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] underline decoration-dotted underline-offset-2"
          >
            {nullAction.label}
          </button>
        ) : (
          "—"
        )}
      </span>
      {subscript}
    </div>
  );
}

function renderFxSubscript(
  s: Shipment,
  onSetRate: () => void,
): React.ReactNode {
  if (!s.currency || s.currency === "GBP") return null;
  if (s.invoice_value == null) return null;

  const rate = s.fx_rate_to_gbp;
  if (rate == null || s.fx_rate_source === "needs_review") {
    return (
      <span className="text-[11px] text-[color:var(--color-ink-faint)] mt-0.5">
        <button
          type="button"
          onClick={onSetRate}
          className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-ink)]"
          style={{ color: "var(--color-accent)" }}
        >
          FX rate needs review — set rate
        </button>
      </span>
    );
  }

  const gbp = s.invoice_value * rate;
  const sourceLabel = s.fx_rate_source
    ? FX_RATE_SOURCE_LABELS[s.fx_rate_source]
    : "—";
  const rateFormatted = rate.toFixed(4);
  const tooltip = `Rate ${rate} · ${sourceLabel} · fixed at creation (${new Date(s.created_at).toISOString().slice(0, 10)})`;

  return (
    <span
      className="text-[11px] text-[color:var(--color-ink-faint)] mt-0.5 font-mono"
      title={tooltip}
    >
      ({formatCurrency(gbp, "GBP")} at {rateFormatted}, {sourceLabel})
    </span>
  );
}

function Event({
  title,
  metaIso,
  current = false,
}: {
  title: string;
  metaIso: string;
  current?: boolean;
}) {
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
        <div className="text-[11px] font-mono text-[color:var(--color-ink-faint)] mt-0.5">
          <ClientTime iso={metaIso} mode="dateShort" /> ·{" "}
          <ClientTime iso={metaIso} mode="time" />
        </div>
      </div>
    </div>
  );
}
