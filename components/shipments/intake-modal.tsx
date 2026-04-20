"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShipment } from "@/lib/actions/shipments";
import type { Incoterm, CommodityCode } from "@/lib/types";

export function IntakeModal({
  open,
  onClose,
  incoterms,
  commodityCodes,
}: {
  open: boolean;
  onClose: () => void;
  incoterms: Incoterm[];
  commodityCodes: CommodityCode[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<0 | 1 | 2>(2); // Default to manual entry for Phase 1
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    origin_country: "",
    destination_country: "",
    supplier_name: "",
    haulier_name: "",
    incoterm: "",
    commodity_code: "",
    invoice_value: "",
    currency: "GBP",
    ior_name: "",
    reason: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createShipment({
        origin_country: form.origin_country || null,
        destination_country: form.destination_country || null,
        supplier_name: form.supplier_name || null,
        haulier_name: form.haulier_name || null,
        incoterm: form.incoterm || null,
        commodity_code: form.commodity_code || null,
        product_type: null,
        invoice_value: form.invoice_value ? parseFloat(form.invoice_value) : null,
        currency: form.currency || "GBP",
        ior_name: form.ior_name || null,
        reason: form.reason || null,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setForm({
          origin_country: "",
          destination_country: "",
          supplier_name: "",
          haulier_name: "",
          incoterm: "",
          commodity_code: "",
          invoice_value: "",
          currency: "GBP",
          ior_name: "",
          reason: "",
        });
        router.refresh();
        onClose();
      }
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
        className="rounded-xl w-full max-w-[680px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        style={{ background: "var(--color-paper)" }}
      >
        <header
          className="px-7 pt-5 pb-4 flex justify-between items-start border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <div className="font-serif text-[26px] font-normal tracking-tight">
              Log a <em className="text-[color:var(--color-ink-soft)]">movement</em>
            </div>
            <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] uppercase tracking-widest mt-1">
              Three ways to get data in
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

        <div className="overflow-y-auto flex-1 px-7 py-6">
          <div
            className="flex gap-1 p-1 rounded-lg border mb-5"
            style={{
              background: "var(--color-paper-warm)",
              borderColor: "var(--color-line)",
            }}
          >
            <TabButton active={tab === 0} onClick={() => setTab(0)} disabled>
              Upload document
              <span className="font-mono text-[9px] ml-1.5 opacity-60">PHASE 2</span>
            </TabButton>
            <TabButton active={tab === 1} onClick={() => setTab(1)} disabled>
              Forward email
              <span className="font-mono text-[9px] ml-1.5 opacity-60">PHASE 3</span>
            </TabButton>
            <TabButton active={tab === 2} onClick={() => setTab(2)}>
              Manual entry
            </TabButton>
          </div>

          {tab === 2 && (
            <form id="intake-form" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 gap-y-3.5">
                <FormField label="Origin country">
                  <input
                    className="form-input"
                    placeholder="e.g. Brazil"
                    value={form.origin_country}
                    onChange={(e) => update("origin_country", e.target.value)}
                  />
                </FormField>
                <FormField label="Destination country">
                  <input
                    className="form-input"
                    placeholder="e.g. United Kingdom"
                    value={form.destination_country}
                    onChange={(e) => update("destination_country", e.target.value)}
                  />
                </FormField>
                <FormField label="Supplier">
                  <input
                    className="form-input"
                    placeholder="Supplier name"
                    value={form.supplier_name}
                    onChange={(e) => update("supplier_name", e.target.value)}
                  />
                </FormField>
                <FormField label="Haulier">
                  <input
                    className="form-input"
                    placeholder="DHL / DPD / Europa"
                    value={form.haulier_name}
                    onChange={(e) => update("haulier_name", e.target.value)}
                  />
                </FormField>
                <FormField label="Incoterm">
                  <select
                    className="form-input"
                    value={form.incoterm}
                    onChange={(e) => update("incoterm", e.target.value)}
                  >
                    <option value="">— select —</option>
                    {incoterms.map((i) => (
                      <option key={i.code} value={i.code}>
                        {i.code} · {i.full_name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Commodity code">
                  <select
                    className="form-input"
                    value={form.commodity_code}
                    onChange={(e) => update("commodity_code", e.target.value)}
                  >
                    <option value="">— select product —</option>
                    {commodityCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.product_type} · {c.code}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Invoice value">
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.invoice_value}
                    onChange={(e) => update("invoice_value", e.target.value)}
                  />
                </FormField>
                <FormField label="Currency">
                  <select
                    className="form-input"
                    value={form.currency}
                    onChange={(e) => update("currency", e.target.value)}
                  >
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </FormField>
                <FormField label="Importer of Record">
                  <input
                    className="form-input"
                    placeholder="IOR entity name"
                    value={form.ior_name}
                    onChange={(e) => update("ior_name", e.target.value)}
                  />
                </FormField>
                <FormField label="" className="col-span-1" />
                <FormField label="Reason for movement" className="col-span-2">
                  <input
                    className="form-input"
                    placeholder="e.g. Import for UK roasting"
                    value={form.reason}
                    onChange={(e) => update("reason", e.target.value)}
                  />
                </FormField>
              </div>

              {error && (
                <div
                  className="mt-4 p-3 rounded text-[13px] font-mono"
                  style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                >
                  {error}
                </div>
              )}
            </form>
          )}
        </div>

        <footer
          className="px-7 py-4 border-t flex justify-between items-center gap-3"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-paper-warm)",
          }}
        >
          <div className="text-[12px] text-[color:var(--color-ink-faint)]">
            Saves as a draft you can review later.
          </div>
          <div className="flex gap-2.5">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              form="intake-form"
              className="btn btn-primary"
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save movement"}
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
            transition: border-color 0.15s;
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

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 px-3 py-2.5 rounded-md text-[13px] font-medium transition-all flex items-center justify-center gap-1.5 ${
        active
          ? "bg-white text-[color:var(--color-ink)] shadow-sm"
          : disabled
            ? "text-[color:var(--color-ink-faint)] cursor-not-allowed"
            : "text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function FormField({
  label,
  children,
  className = "",
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
        {label || "\u00a0"}
      </label>
      {children}
    </div>
  );
}
