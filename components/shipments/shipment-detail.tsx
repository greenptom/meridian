"use client";

import {
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import type {
  Shipment,
  ShipmentDocument,
  ShipmentEvent,
  ShipmentStatus,
} from "@/lib/types";
import { updateShipmentStatus } from "@/lib/actions/shipments";
import { getSignedDocumentUrl } from "@/lib/actions/documents";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
import { useRouter } from "next/navigation";

const statusLabel: Record<ShipmentStatus, string> = {
  active: "Active",
  draft: "Draft",
  review: "Review",
  alert: "Flag",
  archived: "Archived",
};

const STATUS_OPTIONS: ShipmentStatus[] = [
  "draft",
  "active",
  "review",
  "alert",
  "archived",
];

const EVENT_LABEL: Record<ShipmentEvent["type"], string> = {
  created: "Shipment created",
  updated: "Shipment updated",
  status_changed: "Status changed",
  document_attached: "Document attached",
  document_extracted: "Document extracted",
  note_added: "Note added",
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
  onEdit: () => void;
}) {
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
            {s.ref} · {formatDate(s.created_at)}
          </div>
          <button
            onClick={onEdit}
            className="font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border hover:bg-[color:var(--color-paper-warm)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            Edit
          </button>
        </div>
        <div className="font-serif text-[22px] font-medium tracking-tight mt-1 leading-snug">
          {s.origin_country ?? "Unknown"}
          <br />
          <span className="text-[color:var(--color-ink-soft)]">→ {s.destination_country ?? "Unknown"}</span>
        </div>
        <div className="flex gap-2 mt-2.5 items-center flex-wrap">
          <StatusControl shipmentId={s.id} status={s.status} />
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
        <DocumentsList documents={documents} />
      </Section>

      <Section label="Activity">
        <ActivityList shipment={s} events={events} />
      </Section>
    </aside>
  );
}

function StatusControl({
  shipmentId,
  status,
}: {
  shipmentId: string;
  status: ShipmentStatus;
}) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<
    { kind: "saved" } | { kind: "error"; message: string } | null
  >(null);

  useEffect(() => {
    if (!flash) return;
    const duration = flash.kind === "saved" ? 2000 : 4000;
    const t = setTimeout(() => setFlash(null), duration);
    return () => clearTimeout(t);
  }, [flash]);

  function handleChange(next: ShipmentStatus) {
    if (next === optimisticStatus) return;
    setFlash(null);
    startTransition(async () => {
      setOptimisticStatus(next);
      const result = await updateShipmentStatus(shipmentId, next);
      if (result.ok) {
        setFlash({ kind: "saved" });
        router.refresh();
      } else {
        setFlash({ kind: "error", message: result.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="relative inline-flex">
        <span className={`status status-${optimisticStatus} cursor-pointer pr-5`}>
          {statusLabel[optimisticStatus]}
          <span
            aria-hidden
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-60"
          >
            ▾
          </span>
        </span>
        <select
          className="absolute inset-0 opacity-0 cursor-pointer"
          value={optimisticStatus}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.value as ShipmentStatus)}
          aria-label="Change status"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
      </label>
      {isPending && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
          Saving…
        </span>
      )}
      {flash?.kind === "saved" && !isPending && (
        <span
          className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{
            background: "var(--color-ok-soft)",
            color: "var(--color-ok)",
          }}
        >
          Saved
        </span>
      )}
      {flash?.kind === "error" && !isPending && (
        <span
          className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
          title={flash.message}
        >
          Save failed
        </span>
      )}
    </div>
  );
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
          {formatDateShort(d.created_at)}
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
          meta={`${formatDateShort(shipment.created_at)} · ${formatTime(shipment.created_at)}`}
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
          meta={`${formatDateShort(e.created_at)} · ${formatTime(e.created_at)}`}
          current={i === 0}
        />
      ))}
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
