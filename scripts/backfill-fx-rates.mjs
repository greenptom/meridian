#!/usr/bin/env node
// One-off backfill: populate fx_rate_to_gbp + fx_rate_source for any
// shipment that's missing them. Run with `npm run backfill-fx`.
//
// Hits the Supabase service role (bypasses RLS — intentional, matches
// the one-off admin nature of the script). The service key is read
// from .env.local and is NEVER logged.
//
// FX logic duplicates lib/fx/frankfurter.ts intentionally so this
// script can run as plain .mjs without a TS transpile step. Keep the
// two files in sync when either changes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

const FRANKFURTER_BASE =
  process.env.FRANKFURTER_BASE ?? "https://api.frankfurter.app";
const REQUEST_TIMEOUT_MS = 5000;
const MAX_AGE_YEARS = 10;
const THROTTLE_MS = 150;

function loadDotEnvLocal() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const path = join(root, ".env.local");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] != null) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

console.log(`→ Target: ${SUPABASE_URL}`);
console.log(`→ Auth:   service role (RLS bypassed for this admin script)`);
console.log("");

function toDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function lookupFxRate(currency, date) {
  if (!currency || !currency.trim()) {
    return { ok: false, reason: "missing_currency" };
  }
  const code = currency.trim().toUpperCase();
  if (code === "GBP") return { ok: true, rate: 1, source: "frankfurter" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: "missing_currency" };
  }

  const requested = new Date(`${date}T00:00:00Z`);
  const now = new Date();
  if (requested.getTime() > now.getTime()) {
    return { ok: false, reason: "future_date" };
  }
  const years =
    Math.abs(requested.getTime() - now.getTime()) /
    (365.25 * 24 * 60 * 60 * 1000);
  if (years > MAX_AGE_YEARS) return { ok: false, reason: "too_old" };

  const url = `${FRANKFURTER_BASE}/${date}?from=${encodeURIComponent(code)}&to=GBP`;
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (err) {
    if (err?.name === "TimeoutError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "api_error" };
  }

  if (!res.ok) {
    if (res.status === 404 || res.status === 422) {
      return { ok: false, reason: "unknown_currency" };
    }
    return { ok: false, reason: "api_error" };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "api_error" };
  }

  if (body.date !== date) {
    return { ok: false, reason: "weekend_or_holiday" };
  }
  const rate = body?.rates?.GBP;
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return { ok: false, reason: "unknown_currency" };
  }
  return { ok: true, rate, source: "frankfurter" };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { data: rows, error } = await supabase
    .from("shipments")
    .select("id, ref, currency, created_at")
    .is("fx_rate_to_gbp", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to query shipments:", error.message);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log("Nothing to backfill — all shipments already have an FX rate.");
    return;
  }

  const currencyBreakdown = rows.reduce((acc, r) => {
    const key = r.currency?.toUpperCase() ?? "(null)";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Preview:`);
  console.log(`  ${rows.length} shipment(s) have no FX rate set.`);
  console.log(`  Breakdown by currency:`);
  for (const [code, count] of Object.entries(currencyBreakdown).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`    ${code}: ${count}`);
  }
  console.log(
    `  Each non-GBP row triggers one Frankfurter API call (throttled ${THROTTLE_MS}ms).`,
  );
  console.log("");

  const rl = createInterface({ input, output });
  const answer = (await rl.question("Proceed? [y/N] ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") {
    console.log("Aborted. No changes written.");
    return;
  }
  console.log("");
  console.log(`Processing ${rows.length} shipment(s)…\n`);

  const counters = { ok: 0, needs_review: 0, error: 0 };
  const reasonCounts = {};

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const date = toDate(r.created_at);
    const prefix = `[${String(i + 1).padStart(String(rows.length).length, " ")}/${rows.length}] ${r.ref} ${r.currency ?? "???"} ${date ?? "????"}`;

    if (!date) {
      counters.error += 1;
      console.log(`${prefix} → SKIPPED (bad created_at)`);
      continue;
    }

    const lookup = await lookupFxRate(r.currency, date);
    let update;
    let tail;
    if (lookup.ok) {
      update = {
        fx_rate_to_gbp: lookup.rate,
        fx_rate_source: "frankfurter",
      };
      tail = `→ ${lookup.rate.toFixed(6)} ✓`;
    } else {
      update = { fx_rate_to_gbp: null, fx_rate_source: "needs_review" };
      tail = `→ needs_review (${lookup.reason})`;
      reasonCounts[lookup.reason] = (reasonCounts[lookup.reason] ?? 0) + 1;
    }

    const { error: updateError } = await supabase
      .from("shipments")
      .update(update)
      .eq("id", r.id);

    if (updateError) {
      counters.error += 1;
      console.log(`${prefix} → DB ERROR: ${updateError.message}`);
    } else if (lookup.ok) {
      counters.ok += 1;
      console.log(`${prefix} ${tail}`);
    } else {
      counters.needs_review += 1;
      console.log(`${prefix} ${tail}`);
    }

    if (r.currency && r.currency.toUpperCase() !== "GBP") {
      await sleep(THROTTLE_MS);
    }
  }

  console.log("");
  console.log(`Summary:`);
  console.log(`  processed:    ${rows.length}`);
  console.log(`  ok:           ${counters.ok}`);
  console.log(`  needs_review: ${counters.needs_review}`);
  console.log(`  db errors:    ${counters.error}`);
  if (Object.keys(reasonCounts).length > 0) {
    console.log(`  reasons:`);
    for (const [reason, count] of Object.entries(reasonCounts).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`    ${reason}: ${count}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
