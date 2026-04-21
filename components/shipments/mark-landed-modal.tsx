"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markShipmentLanded } from "@/lib/actions/shipments";
import type { Shipment } from "@/lib/types";

function todayIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function MarkLandedModal({
  shipment,
  open,
  onClose,
  onRequestEditQuantity,
}: {
  shipment: Shipment;
  open: boolean;
  onClose: () => void;
  onRequestEditQuantity: () => void;
}) {
  const needsQuantity = shipment.quantity == null;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayIso());
  const [freight, setFreight] = useState<string>(
    shipment.freight_cost != null ? String(shipment.freight_cost) : "",
  );
  const [insurance, setInsurance] = useState<string>(
    shipment.insurance_cost != null ? String(shipment.insurance_cost) : "",
  );
  const [duty, setDuty] = useState<string>(
    shipment.duty_cost != null ? String(shipment.duty_cost) : "",
  );
  const [other, setOther] = useState<string>(
    shipment.other_costs != null ? String(shipment.other_costs) : "",
  );

  const currency = shipment.currency ?? "GBP";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsQuantity) return;
    const num = (v: string) => (v ? parseFloat(v) : null);
    startTransition(async () => {
      const result = await markShipmentLanded(shipment.id, {
        actual_landed_date: date,
        freight_cost: num(freight),
        insurance_cost: num(insurance),
        duty_cost: num(duty),
        other_costs: num(other),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: "rgba(20,15,5,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-xl w-full max-w-[480px] flex flex-col shadow-2xl overflow-hidden"
        style={{ background: "var(--color-paper)" }}
      >
        <header
          className="px-7 pt-5 pb-4 flex justify-between items-start border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <div className="font-serif text-[22px] font-normal tracking-tight">
              Mark as <em className="text-[color:var(--color-ink-soft)]">landed</em>
            </div>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] uppercase tracking-widest mt-1">
              {shipment.ref} · auto-moves to Review for finance sign-off
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[20px] text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] leading-none p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {needsQuantity && (
          <div
            className="mx-7 mt-5 p-3 rounded border text-[13px] flex items-start justify-between gap-3"
            style={{
              background: "var(--color-accent-soft)",
              borderColor: "var(--color-accent)",
              color: "var(--color-accent)",
            }}
          >
            <div>
              This shipment needs a landed quantity before it can be marked
              as landed.
            </div>
            <button
              type="button"
              className="font-mono text-[11px] uppercase tracking-widest underline shrink-0"
              onClick={() => {
                onClose();
                onRequestEditQuantity();
              }}
            >
              Add quantity in Edit
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-7 py-6 flex flex-col gap-4">
          <LandedField label="Actual landed date">
            <input
              className="form-input"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </LandedField>

          <div className="grid grid-cols-2 gap-4">
            <LandedField label={`Freight · ${currency}`}>
              <input
                className="form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
              />
            </LandedField>
            <LandedField label={`Insurance · ${currency}`}>
              <input
                className="form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={insurance}
                onChange={(e) => setInsurance(e.target.value)}
              />
            </LandedField>
            <LandedField label={`Duty · ${currency}`}>
              <input
                className="form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={duty}
                onChange={(e) => setDuty(e.target.value)}
              />
            </LandedField>
            <LandedField label={`Other · ${currency}`}>
              <input
                className="form-input"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={other}
                onChange={(e) => setOther(e.target.value)}
              />
            </LandedField>
          </div>

          {error && (
            <div
              className="p-3 rounded text-[13px] font-mono"
              style={{
                background: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              {error}
            </div>
          )}

          <div
            className="flex justify-end gap-2.5 pt-2 border-t"
            style={{ borderColor: "var(--color-line)" }}
          >
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending || !date || needsQuantity}
            >
              {isPending ? "Saving…" : "Mark as landed"}
            </button>
          </div>
        </form>

        <style>{`
          .form-input {
            font-family: var(--font-sans);
            font-size: 13px;
            padding: 9px 12px;
            border: 1px solid var(--color-line);
            border-radius: 6px;
            background: var(--color-card);
            color: var(--color-ink);
            width: 100%;
          }
          .form-input:focus {
            outline: none;
            border-color: var(--color-ink);
            box-shadow: 0 0 0 3px rgba(20,15,5,0.05);
          }
        `}</style>
      </div>
    </div>
  );
}

function LandedField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
        {label}
      </label>
      {children}
    </div>
  );
}
