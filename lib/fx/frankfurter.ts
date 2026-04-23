// Frankfurter FX lookup — uses ECB daily rates, no API key required.
// See https://www.frankfurter.app for the public schema.
//
// Philosophy: flag, don't fix. Any edge case (missing currency, weekend,
// API error, future-dated row, unknown currency) resolves to
// { ok: false, reason } so the caller can persist the shipment with
// fx_rate_source = 'needs_review' and let the user decide later.

import type { FxRateSource } from "@/lib/types";

export type FxNeedsReviewReason =
  | "future_date"
  | "too_old"
  | "weekend_or_holiday"
  | "unknown_currency"
  | "missing_currency"
  | "api_error"
  | "timeout";

export type FxLookup =
  | {
      ok: true;
      rate: number;
      source: Extract<FxRateSource, "frankfurter">;
    }
  | {
      ok: false;
      reason: FxNeedsReviewReason;
    };

const FRANKFURTER_BASE =
  process.env.FRANKFURTER_BASE ?? "https://api.frankfurter.app";
const REQUEST_TIMEOUT_MS = 5000;
const MAX_AGE_YEARS = 10;

type FrankfurterResponse = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function yearsBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

export function todayUtcIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toUtcIsoDate(input: string | Date | null | undefined): string | null {
  if (!input) return null;
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  if (isIsoDate(input)) return input;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export async function lookupFxRate(
  currency: string | null | undefined,
  date: string,
): Promise<FxLookup> {
  if (!currency || !currency.trim()) {
    return { ok: false, reason: "missing_currency" };
  }
  const code = currency.trim().toUpperCase();
  if (code === "GBP") return { ok: true, rate: 1, source: "frankfurter" };

  if (!isIsoDate(date)) {
    throw new Error(`lookupFxRate: date must be YYYY-MM-DD, got "${date}"`);
  }

  const requested = new Date(`${date}T00:00:00Z`);
  const now = new Date();
  if (requested.getTime() > now.getTime()) {
    return { ok: false, reason: "future_date" };
  }
  if (yearsBetween(requested, now) > MAX_AGE_YEARS) {
    return { ok: false, reason: "too_old" };
  }

  const url = `${FRANKFURTER_BASE}/${date}?from=${encodeURIComponent(code)}&to=GBP`;

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "api_error" };
  }

  if (!res.ok) {
    if (res.status === 404 || res.status === 422) {
      return { ok: false, reason: "unknown_currency" };
    }
    return { ok: false, reason: "api_error" };
  }

  let body: FrankfurterResponse;
  try {
    body = (await res.json()) as FrankfurterResponse;
  } catch {
    return { ok: false, reason: "api_error" };
  }

  // Frankfurter silently serves the previous business day's rate on a
  // non-trading date. Detecting the shift via a body.date mismatch
  // covers both weekends and bank holidays without us maintaining a
  // holiday calendar.
  if (body.date !== date) {
    return { ok: false, reason: "weekend_or_holiday" };
  }

  const rate = body.rates?.GBP;
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return { ok: false, reason: "unknown_currency" };
  }

  return { ok: true, rate, source: "frankfurter" };
}
