"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createBatch,
  type EligibleSource,
} from "@/lib/actions/batches";
import type { QuantityUnit } from "@/lib/types";

const QUANTITY_UNITS: QuantityUnit[] = [
  "kg",
  "g",
  "lb",
  "units",
  "pallets",
  "containers",
];

type UseRow = {
  key: string;
  shipment_id: string;
  quantity_used: string;
};

function newRow(): UseRow {
  return { key: crypto.randomUUID(), shipment_id: "", quantity_used: "" };
}

export function AddBatchModal({
  open,
  onClose,
  eligibleSources,
}: {
  open: boolean;
  onClose: () => void;
  eligibleSources: EligibleSource[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [batchCode, setBatchCode] = useState("");
  const [blendName, setBlendName] = useState("");
  const [roastedDate, setRoastedDate] = useState("");
  const [quantityProduced, setQuantityProduced] = useState("");
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit | "">("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<UseRow[]>([newRow()]);

  const sourcesForUnit = useMemo(() => {
    if (!quantityUnit) return [];
    return eligibleSources.filter((s) => s.quantity_unit === quantityUnit);
  }, [eligibleSources, quantityUnit]);

  const sourceById = useMemo(
    () => new Map(eligibleSources.map((s) => [s.id, s])),
    [eligibleSources],
  );

  const selectedIds = new Set(
    rows.map((r) => r.shipment_id).filter(Boolean),
  );

  const target = parseFloat(quantityProduced) || 0;
  const allocated = rows.reduce(
    (a, r) => a + (parseFloat(r.quantity_used) || 0),
    0,
  );
  const delta = target - allocated;
  const allRowsComplete = rows.every(
    (r) => r.shipment_id && parseFloat(r.quantity_used) > 0,
  );
  const allWithinRemaining = rows.every((r) => {
    if (!r.shipment_id) return true;
    const src = sourceById.get(r.shipment_id);
    const used = parseFloat(r.quantity_used) || 0;
    return src ? used <= src.remaining + 0.0005 : true;
  });
  const canSubmit =
    batchCode.trim().length > 0 &&
    target > 0 &&
    !!quantityUnit &&
    Math.abs(delta) < 0.0005 &&
    allRowsComplete &&
    allWithinRemaining &&
    rows.length > 0;

  function reset() {
    setBatchCode("");
    setBlendName("");
    setRoastedDate("");
    setQuantityProduced("");
    setQuantityUnit("");
    setNotes("");
    setRows([newRow()]);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleUnitChange(next: QuantityUnit | "") {
    setQuantityUnit(next);
    // Drop any selected rows whose shipment no longer matches the unit
    setRows((prev) =>
      prev.map((r) => {
        if (!r.shipment_id) return r;
        const src = sourceById.get(r.shipment_id);
        if (!src || src.quantity_unit !== next) {
          return { ...r, shipment_id: "", quantity_used: "" };
        }
        return r;
      }),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit || !quantityUnit) return;
    startTransition(async () => {
      const result = await createBatch(
        {
          batch_code: batchCode.trim(),
          blend_name: blendName.trim() || null,
          roasted_date: roastedDate || null,
          quantity_produced: target,
          quantity_unit: quantityUnit,
          notes: notes.trim() || null,
        },
        rows.map((r) => ({
          shipment_id: r.shipment_id,
          quantity_used: parseFloat(r.quantity_used),
          notes: null,
        })),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      router.refresh();
      onClose();
    });
  }

  if (!open) return null;

  const deltaLabel =
    Math.abs(delta) < 0.0005
      ? "All allocated"
      : delta > 0
        ? `${formatNum(delta)} ${quantityUnit} to allocate`
        : `Over by ${formatNum(-delta)} ${quantityUnit}`;
  const deltaColor =
    Math.abs(delta) < 0.0005
      ? "var(--color-ok)"
      : delta > 0
        ? "var(--color-ink-soft)"
        : "var(--color-accent)";

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: "rgba(20,15,5,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="rounded-xl w-full max-w-[680px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        style={{ background: "var(--color-paper)" }}
      >
        <header
          className="px-7 pt-5 pb-4 flex justify-between items-start border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <div className="font-serif text-[26px] font-normal tracking-tight">
              Add a <em className="text-[color:var(--color-ink-soft)]">batch</em>
            </div>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] uppercase tracking-widest mt-1">
              Blend sources into a production run
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-[20px] text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] leading-none p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto flex-1 px-7 py-6">
          <form id="add-batch-form" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 gap-y-3.5">
              <FormField label="Batch code">
                <input
                  className="form-input"
                  placeholder="e.g. CAB-2026-04"
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                />
              </FormField>
              <FormField label="Blend name">
                <input
                  className="form-input"
                  placeholder="e.g. House Blend"
                  value={blendName}
                  onChange={(e) => setBlendName(e.target.value)}
                />
              </FormField>
              <FormField label="Roasted date">
                <input
                  className="form-input"
                  type="date"
                  value={roastedDate}
                  onChange={(e) => setRoastedDate(e.target.value)}
                />
              </FormField>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <FormField label="Quantity produced">
                  <input
                    className="form-input"
                    type="number"
                    step="0.001"
                    placeholder="0"
                    value={quantityProduced}
                    onChange={(e) => setQuantityProduced(e.target.value)}
                  />
                </FormField>
                <FormField label="Unit">
                  <select
                    className="form-input"
                    value={quantityUnit}
                    onChange={(e) =>
                      handleUnitChange(e.target.value as QuantityUnit | "")
                    }
                  >
                    <option value="">—</option>
                    {QUANTITY_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField label="Notes" className="col-span-2">
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Optional"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormField>
            </div>

            <div
              className="mt-7 pt-5 border-t"
              style={{ borderColor: "var(--color-line-soft)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
                  Source shipments
                </div>
                {quantityUnit && (
                  <button
                    type="button"
                    onClick={() => setRows((r) => [...r, newRow()])}
                    className="font-mono text-[10px] uppercase tracking-widest underline text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
                  >
                    + Add another
                  </button>
                )}
              </div>

              {!quantityUnit ? (
                <div
                  className="text-[12px] italic text-[color:var(--color-ink-faint)] px-3 py-4 text-center rounded border border-dashed"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  Pick a quantity unit first — the shipment list will filter to matching units.
                </div>
              ) : sourcesForUnit.length === 0 ? (
                <div
                  className="text-[12px] italic text-[color:var(--color-ink-faint)] px-3 py-4 text-center rounded border border-dashed"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  No active shipments with stock remaining in {quantityUnit}.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {rows.map((r, i) => {
                    const selected = sourceById.get(r.shipment_id);
                    const options = sourcesForUnit.filter(
                      (s) => s.id === r.shipment_id || !selectedIds.has(s.id),
                    );
                    const used = parseFloat(r.quantity_used) || 0;
                    const over =
                      !!selected && used > selected.remaining + 0.0005;
                    return (
                      <div
                        key={r.key}
                        className="grid grid-cols-[1fr_140px_auto] gap-2 items-start"
                      >
                        <div>
                          <select
                            className="form-input"
                            value={r.shipment_id}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((row, idx) =>
                                  idx === i
                                    ? { ...row, shipment_id: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="">— select shipment —</option>
                            {options.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.ref} · {s.origin_country ?? "?"}→
                                {s.destination_country ?? "?"} ·{" "}
                                {formatNum(s.remaining)} {s.quantity_unit} left
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <input
                            className="form-input"
                            type="number"
                            step="0.001"
                            placeholder="qty"
                            value={r.quantity_used}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((row, idx) =>
                                  idx === i
                                    ? { ...row, quantity_used: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                          {over && (
                            <div
                              className="font-mono text-[10px] mt-1"
                              style={{ color: "var(--color-accent)" }}
                            >
                              Over remaining ({formatNum(selected!.remaining)})
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) =>
                              prev.length === 1
                                ? [newRow()]
                                : prev.filter((_, idx) => idx !== i),
                            )
                          }
                          aria-label="Remove source"
                          className="text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-accent)] px-2 py-2 leading-none"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {quantityUnit && target > 0 && (
                <div
                  className="mt-3 flex justify-between items-baseline px-3 py-2 rounded"
                  style={{ background: "var(--color-paper-warm)" }}
                >
                  <span className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
                    {formatNum(allocated)} / {formatNum(target)} {quantityUnit}
                  </span>
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: deltaColor }}
                  >
                    {deltaLabel}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div
                className="mt-4 p-3 rounded text-[13px] font-mono"
                style={{
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                }}
              >
                {error}
              </div>
            )}
          </form>
        </div>

        <footer
          className="px-7 py-4 border-t flex justify-between items-center gap-3"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-paper-warm)",
          }}
        >
          <div className="text-[12px] text-[color:var(--color-ink-faint)]">
            Sources must match the batch unit and sum to the produced quantity.
          </div>
          <div className="flex gap-2.5">
            <button type="button" className="btn" onClick={handleClose}>
              Cancel
            </button>
            <button
              type="submit"
              form="add-batch-form"
              className="btn btn-primary"
              disabled={!canSubmit || isPending}
            >
              {isPending ? "Saving…" : "Create batch"}
            </button>
          </div>
        </footer>

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
            transition: border-color 0.15s, background 0.15s;
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

function FormField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
}
