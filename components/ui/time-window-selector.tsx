"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  PERIOD_LABELS,
  PERIOD_OPTIONS,
  isCustomRangeValid,
  parseTimeWindowParams,
  serializeTimeWindowParams,
  type Period,
  type TimeWindowSelection,
} from "@/lib/time-window";

// The period dropdown's option groupings, in the order finance reads:
// Full year first, then quarters, then months. "Custom" sits at the
// bottom; "All time" is a separate link, not part of this dropdown.
const PERIOD_GROUPS: Array<{ label: string; options: Period[] }> = [
  { label: "—", options: ["full_year"] },
  { label: "Quarters", options: ["q1", "q2", "q3", "q4"] },
  {
    label: "Months",
    options: PERIOD_OPTIONS.filter(
      (p) => p !== "full_year" && !p.startsWith("q") && p !== "custom",
    ),
  },
  { label: "Custom", options: ["custom"] },
];

export function TimeWindowSelector({
  years,
}: {
  // Caller supplies the year list (computed server-side from
  // shipments). We never fetch here so the component is reusable.
  years: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selection = useMemo(
    () =>
      parseTimeWindowParams(
        Object.fromEntries(searchParams.entries()) as Record<string, string>,
      ),
    [searchParams],
  );

  // Local draft state for custom dates — only committed to the URL
  // when both fields are valid. Seeded from URL on first render and
  // when the URL itself changes.
  const initialFrom = selection.mode === "custom" ? selection.from : "";
  const initialTo = selection.mode === "custom" ? selection.to : "";
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);
  const [customError, setCustomError] = useState<string | null>(null);

  function pushSelection(next: TimeWindowSelection) {
    const tw = serializeTimeWindowParams(next);
    const merged = new URLSearchParams();
    // Preserve any non-time-window params on the URL (e.g. ?destination=).
    for (const [k, v] of searchParams.entries()) {
      if (
        k !== "year" &&
        k !== "period" &&
        k !== "from" &&
        k !== "to" &&
        k !== "window"
      ) {
        merged.set(k, v);
      }
    }
    for (const [k, v] of Object.entries(tw)) merged.set(k, v);
    const qs = merged.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function onYearChange(yearStr: string) {
    const year = Number.parseInt(yearStr, 10);
    if (selection.mode === "year") {
      pushSelection({ ...selection, year });
    } else {
      // Switching back from all/custom into a year — default to full_year.
      pushSelection({ mode: "year", year, period: "full_year" });
    }
  }

  function onPeriodChange(periodValue: Period) {
    if (periodValue === "custom") {
      // If draft dates are already valid (e.g. came from URL), commit
      // immediately. Otherwise, just switch local UI to custom mode.
      if (isCustomRangeValid(draftFrom, draftTo)) {
        pushSelection({
          mode: "custom",
          from: draftFrom,
          to: draftTo,
        });
        setCustomError(null);
      } else {
        // Mark as in-progress custom by stashing a fake selection
        // that just shows the inputs — we don't push an invalid URL.
        setCustomError(null);
        // No URL push: keeps the current resolved range until the user
        // fills both dates.
      }
      // Force the UI to show the custom inputs even without a URL push.
      setShowCustomInputs(true);
      return;
    }
    setShowCustomInputs(false);
    setCustomError(null);
    const year =
      selection.mode === "year" ? selection.year : new Date().getUTCFullYear();
    pushSelection({ mode: "year", year, period: periodValue });
  }

  function onCustomBlur() {
    if (!draftFrom && !draftTo) return;
    if (!isCustomRangeValid(draftFrom, draftTo)) {
      if (draftFrom && draftTo && draftTo < draftFrom) {
        setCustomError("End date must be on or after start date.");
      } else {
        setCustomError(null);
      }
      return;
    }
    setCustomError(null);
    pushSelection({ mode: "custom", from: draftFrom, to: draftTo });
  }

  function onAllTime() {
    setShowCustomInputs(false);
    setCustomError(null);
    pushSelection({ mode: "all" });
  }

  const isCustomMode = selection.mode === "custom";
  const isAllMode = selection.mode === "all";
  const [showCustomInputs, setShowCustomInputs] = useState(isCustomMode);

  const yearDisabled = isAllMode || isCustomMode || showCustomInputs;
  const yearValue =
    selection.mode === "year"
      ? String(selection.year)
      : String(new Date().getUTCFullYear());
  const periodValue: Period =
    selection.mode === "year"
      ? selection.period
      : selection.mode === "custom"
        ? "custom"
        : "full_year";
  const periodDisabled = isAllMode;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
        Window:
      </span>
      <select
        className="tw-select"
        value={yearValue}
        disabled={yearDisabled || isPending}
        onChange={(e) => onYearChange(e.target.value)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        className="tw-select"
        value={showCustomInputs && !isCustomMode ? "custom" : periodValue}
        disabled={periodDisabled || isPending}
        onChange={(e) => onPeriodChange(e.target.value as Period)}
      >
        {PERIOD_GROUPS.map((group, i) =>
          group.options.length === 1 && group.label === "—" ? (
            <option key={i} value={group.options[0]}>
              {PERIOD_LABELS[group.options[0]]}
            </option>
          ) : (
            <optgroup key={i} label={group.label}>
              {group.options.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
      {(isCustomMode || showCustomInputs) && (
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            className="tw-select"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            onBlur={onCustomBlur}
          />
          <span className="text-[color:var(--color-ink-faint)]">–</span>
          <input
            type="date"
            className="tw-select"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            onBlur={onCustomBlur}
          />
        </span>
      )}
      <button
        type="button"
        className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] underline decoration-dotted underline-offset-2 ml-1"
        onClick={onAllTime}
        disabled={isPending}
      >
        {isAllMode ? "All time ✓" : "Reset to all time"}
      </button>
      {customError && (
        <span
          className="text-[11px] font-mono w-full"
          style={{ color: "var(--color-accent)" }}
        >
          {customError}
        </span>
      )}
      <style>{`
        .tw-select {
          font-family: var(--font-sans);
          font-size: 12px;
          padding: 6px 10px;
          border: 1px solid var(--color-line);
          border-radius: 6px;
          background: var(--color-card);
          color: var(--color-ink);
          transition: border-color 0.15s;
        }
        .tw-select:focus {
          outline: none;
          border-color: var(--color-ink);
          box-shadow: 0 0 0 3px rgba(20,15,5,0.05);
        }
        .tw-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
