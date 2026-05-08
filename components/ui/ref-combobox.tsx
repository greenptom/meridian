"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type RefOption = {
  id: string;
  name: string;
  secondary?: string | null;
};

export type RefValue = { id: string | null; label: string };

export function RefCombobox({
  value,
  options,
  onChange,
  onAddNew,
  placeholder,
  className,
  inputClassName = "form-input",
  inputId,
  disabled,
  noun,
}: {
  value: RefValue;
  options: RefOption[];
  onChange: (next: RefValue) => void;
  onAddNew?: (typed: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputId?: string;
  disabled?: boolean;
  // Singular noun used in the "Add new" CTA, e.g. "haulier".
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [draft, setDraft] = useState(value.label);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the local draft in sync when the parent supplies a fresh value
  // (extraction fill, edit-mode prefill, "Add new" callback snap).
  useEffect(() => {
    setDraft(value.label);
  }, [value.id, value.label]);

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [draft, options]);

  const exactMatch = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return null;
    return options.find((o) => o.name.toLowerCase() === q) ?? null;
  }, [draft, options]);

  // Outside-click commits the current draft as either the exact match
  // (FK link) or as free text (no FK). This keeps Tab and click-away
  // behaving the same — typed text is never lost silently.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (exactMatch) {
          if (value.id !== exactMatch.id) {
            onChange({ id: exactMatch.id, label: exactMatch.name });
          }
        } else if (draft !== value.label) {
          onChange({ id: null, label: draft });
        }
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, draft, exactMatch, value.id, value.label, onChange]);

  function selectOption(o: RefOption) {
    setDraft(o.name);
    setOpen(false);
    onChange({ id: o.id, label: o.name });
  }

  function commitFreeText() {
    setOpen(false);
    if (exactMatch) {
      if (value.id !== exactMatch.id) {
        onChange({ id: exactMatch.id, label: exactMatch.name });
      }
    } else {
      onChange({ id: null, label: draft });
    }
  }

  function clear() {
    setDraft("");
    setOpen(false);
    onChange({ id: null, label: "" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) =>
        filtered.length === 0 ? 0 : Math.min(h + 1, filtered.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered.length > 0 && filtered[highlight]) {
        selectOption(filtered[highlight]);
      } else {
        commitFreeText();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value.label);
      setOpen(false);
    } else if (e.key === "Tab") {
      // Don't preventDefault — let focus move on naturally.
      commitFreeText();
    }
  }

  const showNoMatch = !exactMatch && draft.trim().length > 0;
  const addLabel = noun ? `as new ${noun}` : "as new";

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <input
          id={inputId}
          className={`flex-1 ${inputClassName}`}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {value.id && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="text-[14px] leading-none px-1.5 py-1 rounded text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)]"
            aria-label="Clear"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div
          className="absolute z-10 left-0 right-0 mt-1 rounded-md border shadow-lg max-h-64 overflow-auto"
          style={{
            background: "var(--color-paper)",
            borderColor: "var(--color-line)",
          }}
        >
          {filtered.length === 0 && draft.trim() === "" && (
            <div className="px-3 py-2 text-[12px] text-[color:var(--color-ink-faint)] italic">
              No reference rows yet.
            </div>
          )}
          {filtered.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => selectOption(o)}
              className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-3 ${
                i === highlight ? "bg-black/5" : ""
              }`}
            >
              <span className="font-medium">{o.name}</span>
              {o.secondary && (
                <span className="font-mono text-[11px] text-[color:var(--color-ink-faint)]">
                  {o.secondary}
                </span>
              )}
            </button>
          ))}
          {showNoMatch && (
            <>
              {filtered.length > 0 && (
                <div
                  className="border-t"
                  style={{ borderColor: "var(--color-line-soft)" }}
                />
              )}
              <div className="px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
                No reference match
              </div>
              {onAddNew && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Use mousedown so the outside-click handler doesn't
                    // fire first and commit free text.
                    e.preventDefault();
                    onAddNew(draft.trim());
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-black/5"
                  style={{ color: "var(--color-accent)" }}
                >
                  + Add &lsquo;{draft.trim()}&rsquo; {addLabel}
                </button>
              )}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitFreeText();
                }}
                className="w-full text-left px-3 py-2 pb-2.5 text-[12px] text-[color:var(--color-ink-soft)] hover:bg-black/5"
              >
                Use as free text
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
