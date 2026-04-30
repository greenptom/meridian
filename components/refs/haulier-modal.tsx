"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createHaulier,
  updateHaulier,
  type HaulierInput,
} from "@/lib/actions/hauliers";
import type { Haulier } from "@/lib/types";

type FormState = {
  name: string;
  country: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  country: "",
  contact_email: "",
  contact_phone: "",
  notes: "",
};

function fromHaulier(h: Haulier | null): FormState {
  if (!h) return EMPTY;
  return {
    name: h.name,
    country: h.country ?? "",
    contact_email: h.contact_email ?? "",
    contact_phone: h.contact_phone ?? "",
    notes: h.notes ?? "",
  };
}

function toInput(form: FormState): HaulierInput {
  return {
    name: form.name,
    country: form.country || null,
    contact_email: form.contact_email || null,
    contact_phone: form.contact_phone || null,
    notes: form.notes || null,
  };
}

export function HaulierModal({
  open,
  onClose,
  editing = null,
  initialName,
  onCreated,
  zIndex = 100,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Haulier | null;
  initialName?: string;
  onCreated?: (id: string, name: string) => void;
  zIndex?: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => fromHaulier(editing));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      const base = fromHaulier(editing);
      setForm(
        editing || !initialName ? base : { ...base, name: initialName },
      );
      setError(null);
    }
  }, [open, editing, initialName]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = toInput(form);
    if (!input.name.trim()) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      if (editing) {
        const result = await updateHaulier(editing.id, input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createHaulier(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (onCreated) onCreated(result.data.id, input.name.trim());
      }
      router.refresh();
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 grid place-items-center p-4"
      style={{
        background: "rgba(20,15,5,0.4)",
        backdropFilter: "blur(4px)",
        zIndex,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-xl w-full max-w-[520px] shadow-2xl overflow-hidden"
        style={{ background: "var(--color-paper)" }}
      >
        <header
          className="px-6 pt-5 pb-4 border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div className="font-serif text-[24px] font-normal tracking-tight">
            {editing ? (
              <>
                Edit <em className="text-[color:var(--color-ink-soft)]">haulier</em>
              </>
            ) : (
              <>
                Add a <em className="text-[color:var(--color-ink-soft)]">haulier</em>
              </>
            )}
          </div>
        </header>

        <form id="haulier-form" onSubmit={handleSubmit} className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 gap-y-3.5">
            <Field label="Name *" className="col-span-2">
              <input
                className="form-input"
                placeholder="e.g. DHL Global"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                autoFocus={!editing}
              />
            </Field>
            <Field label="Country">
              <input
                className="form-input"
                placeholder="e.g. GB"
                maxLength={3}
                value={form.country}
                onChange={(e) => update("country", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Contact email">
              <input
                className="form-input"
                type="email"
                placeholder="ops@example.com"
                value={form.contact_email}
                onChange={(e) => update("contact_email", e.target.value)}
              />
            </Field>
            <Field label="Contact phone" className="col-span-2">
              <input
                className="form-input"
                placeholder="+44 …"
                value={form.contact_phone}
                onChange={(e) => update("contact_phone", e.target.value)}
              />
            </Field>
            <Field label="Notes" className="col-span-2">
              <textarea
                className="form-input"
                rows={3}
                placeholder="Optional"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
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

        <footer
          className="px-6 py-4 border-t flex justify-end gap-2.5"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-paper-warm)",
          }}
        >
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="haulier-form"
            className="btn btn-primary"
            disabled={isPending}
          >
            {isPending
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add haulier"}
          </button>
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

function Field({
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
