// Time window primitive — pure functions for resolving year + period
// (or custom range, or "all time") into [from, to) UTC timestamps.
//
// Shared between server code (e.g. /exposure reading searchParams in a
// Server Component) and client code (the selector component). Keeping
// this file React-free so it imports cleanly from both sides; the
// client-side hook lives next to the selector component.

export const PERIOD_OPTIONS = [
  "full_year",
  "q1",
  "q2",
  "q3",
  "q4",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "custom",
] as const;

export type Period = (typeof PERIOD_OPTIONS)[number];

const MONTH_PERIODS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export const PERIOD_LABELS: Record<Period, string> = {
  full_year: "Full year",
  q1: "Q1 (Jan – Mar)",
  q2: "Q2 (Apr – Jun)",
  q3: "Q3 (Jul – Sep)",
  q4: "Q4 (Oct – Dec)",
  january: "January",
  february: "February",
  march: "March",
  april: "April",
  may: "May",
  june: "June",
  july: "July",
  august: "August",
  september: "September",
  october: "October",
  november: "November",
  december: "December",
  custom: "Custom range",
};

export type TimeWindowMode = "year" | "custom" | "all";

export type TimeWindowSelection =
  | { mode: "year"; year: number; period: Exclude<Period, "custom"> }
  | { mode: "custom"; from: string; to: string }
  | { mode: "all" };

export type ResolvedWindow = {
  from: Date | null;
  to: Date | null;
  label: string;
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function utcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

// Resolve a selection to half-open [from, to) UTC timestamps.
// `to` is exclusive — `created_at < to` is the right SQL form.
export function resolveTimeWindow(s: TimeWindowSelection): ResolvedWindow {
  if (s.mode === "all") {
    return { from: null, to: null, label: "All time" };
  }

  if (s.mode === "custom") {
    const from = new Date(`${s.from}T00:00:00Z`);
    const to = new Date(`${s.to}T00:00:00Z`);
    // Inclusive end → exclusive upper bound by adding one day.
    const exclusiveTo = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
    const fmt = (d: Date, withYear: boolean) =>
      `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}${
        withYear ? ` ${d.getUTCFullYear()}` : ""
      }`;
    const label = sameYear
      ? `${fmt(from, false)} – ${fmt(to, true)}`
      : `${fmt(from, true)} – ${fmt(to, true)}`;
    return { from, to: exclusiveTo, label };
  }

  const { year, period } = s;
  if (period === "full_year") {
    return {
      from: utcMidnight(year, 0, 1),
      to: utcMidnight(year + 1, 0, 1),
      label: `${year}`,
    };
  }
  if (period === "q1") {
    return {
      from: utcMidnight(year, 0, 1),
      to: utcMidnight(year, 3, 1),
      label: `Q1 ${year}`,
    };
  }
  if (period === "q2") {
    return {
      from: utcMidnight(year, 3, 1),
      to: utcMidnight(year, 6, 1),
      label: `Q2 ${year}`,
    };
  }
  if (period === "q3") {
    return {
      from: utcMidnight(year, 6, 1),
      to: utcMidnight(year, 9, 1),
      label: `Q3 ${year}`,
    };
  }
  if (period === "q4") {
    return {
      from: utcMidnight(year, 9, 1),
      to: utcMidnight(year + 1, 0, 1),
      label: `Q4 ${year}`,
    };
  }

  const monthIdx = MONTH_PERIODS[period];
  if (monthIdx === undefined) {
    // Shouldn't happen given the type, but be defensive.
    return resolveTimeWindow({ mode: "year", year, period: "full_year" });
  }
  const monthName =
    period.charAt(0).toUpperCase() + period.slice(1).toLowerCase();
  return {
    from: utcMidnight(year, monthIdx, 1),
    to: utcMidnight(year, monthIdx + 1, 1),
    label: `${monthName} ${year}`,
  };
}

// Parse query params into a selection. Falls back to default on any
// malformed input — never throws. Default is current-year + full year.
export function parseTimeWindowParams(
  params: URLSearchParams | Record<string, string | undefined>,
  now: Date = new Date(),
): TimeWindowSelection {
  const get = (k: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      const v = params.get(k);
      return v ?? undefined;
    }
    return params[k];
  };

  const defaultSel: TimeWindowSelection = {
    mode: "year",
    year: now.getUTCFullYear(),
    period: "full_year",
  };

  if (get("window") === "all") {
    return { mode: "all" };
  }

  const period = get("period");
  if (period === "custom") {
    const from = get("from");
    const to = get("to");
    if (
      from &&
      to &&
      isIsoDate(from) &&
      isIsoDate(to) &&
      from <= to
    ) {
      return { mode: "custom", from, to };
    }
    return defaultSel;
  }

  const yearRaw = get("year");
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;
  const validYear =
    Number.isInteger(year) && year >= 1900 && year <= 2200
      ? year
      : defaultSel.year;

  const validPeriod: Exclude<Period, "custom"> =
    period && PERIOD_OPTIONS.includes(period as Period) && period !== "custom"
      ? (period as Exclude<Period, "custom">)
      : "full_year";

  return { mode: "year", year: validYear, period: validPeriod };
}

// Serialise a selection to query params. Only emits non-default keys
// so the URL stays clean.
export function serializeTimeWindowParams(
  s: TimeWindowSelection,
  now: Date = new Date(),
): Record<string, string> {
  if (s.mode === "all") return { window: "all" };
  if (s.mode === "custom") {
    return { period: "custom", from: s.from, to: s.to };
  }
  const out: Record<string, string> = {};
  const currentYear = now.getUTCFullYear();
  if (s.year !== currentYear) out.year = String(s.year);
  if (s.period !== "full_year") out.period = s.period;
  return out;
}

// Compose a query string by merging a TimeWindow selection with any
// other params (e.g. ?destination=GB on the shipments clickthrough).
export function timeWindowQueryString(
  s: TimeWindowSelection,
  extra: Record<string, string | null | undefined> = {},
  now: Date = new Date(),
): string {
  const tw = serializeTimeWindowParams(s, now);
  const merged: Record<string, string> = { ...tw };
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== "") merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `?${qs}` : "";
}

export function isCustomRangeValid(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!from || !to) return false;
  if (!isIsoDate(from) || !isIsoDate(to)) return false;
  return from <= to;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Years to offer in the year dropdown: current year, previous year,
// plus every year that has at least one shipment created in it. Sorted
// descending, deduped.
export function availableYears(
  shipmentCreatedAtIsoStrings: ReadonlyArray<string>,
  now: Date = new Date(),
): number[] {
  const set = new Set<number>();
  const currentYear = now.getUTCFullYear();
  set.add(currentYear);
  set.add(currentYear - 1);
  for (const iso of shipmentCreatedAtIsoStrings) {
    const y = new Date(iso).getUTCFullYear();
    if (Number.isInteger(y)) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}
