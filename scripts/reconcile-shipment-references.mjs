#!/usr/bin/env node
// One-off reconciliation: scan every shipment's free-text
// haulier_name / supplier_name / ior_name fields, look up the
// matching reference row, and populate haulier_id / supplier_id /
// ior_id where there's a confident match. Run with
// `npm run reconcile-references`.
//
// Match strategy: exact first, then case-insensitive. NO fuzzy
// matching — false matches are worse than false misses. Anything
// that doesn't exact/case-match is reported back as unmatched and
// stays NULL on its FK column for the user to resolve manually
// (typically by adding a reference row in /reference/{type} and
// re-running this script).
//
// Idempotent: only acts on rows where the FK column is currently
// null. Re-running after partially populating refs only fills the
// gaps left over.
//
// Service role bypasses RLS — same admin posture as the FX
// backfill. The service key is read from .env.local and NEVER
// logged.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

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

// Each ref field on shipments mapped to the reference table that
// holds its canonical rows.
const FIELDS = [
  { key: "haulier", table: "hauliers", referencePath: "/reference/hauliers" },
  { key: "supplier", table: "suppliers", referencePath: "/reference/suppliers" },
  { key: "ior", table: "iors", referencePath: "/reference/iors" },
];

// Build lookup maps for one reference table: exact name → id, and
// lowercased name → id. Both use the active set (deleted_at is null)
// because resolving onto an archived row would re-link it on save and
// fight with the soft-delete model.
async function buildLookup(table) {
  const { data, error } = await supabase
    .from(table)
    .select("id, name")
    .is("deleted_at", null);
  if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
  const exact = new Map();
  const lower = new Map();
  for (const row of data ?? []) {
    if (!row.name) continue;
    exact.set(row.name, row.id);
    lower.set(row.name.toLowerCase(), row.id);
  }
  return { exact, lower, count: exact.size };
}

function matchName(name, lookup) {
  if (!name) return { matched: false, id: null };
  const trimmed = name.trim();
  if (!trimmed) return { matched: false, id: null };
  if (lookup.exact.has(trimmed)) {
    return { matched: true, id: lookup.exact.get(trimmed) };
  }
  const lower = trimmed.toLowerCase();
  if (lookup.lower.has(lower)) {
    return { matched: true, id: lookup.lower.get(lower) };
  }
  return { matched: false, id: null };
}

async function main() {
  const lookups = {};
  for (const f of FIELDS) {
    lookups[f.key] = await buildLookup(f.table);
  }

  console.log(`Reference rows available:`);
  for (const f of FIELDS) {
    console.log(`  ${f.table.padEnd(10)}: ${lookups[f.key].count}`);
  }
  console.log("");

  // Pull every shipment, including archived. Historic data deserves
  // clean references too. We never modify archived_at.
  const { data: shipments, error } = await supabase
    .from("shipments")
    .select(
      "id, ref, haulier_name, haulier_id, supplier_name, supplier_id, ior_name, ior_id",
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to query shipments:", error.message);
    process.exit(1);
  }

  if (!shipments?.length) {
    console.log("No shipments to reconcile.");
    return;
  }

  // Build the plan in memory before printing the preview, so the
  // summary numbers are accurate before the user decides.
  const plan = []; // { id, ref, updates: { haulier_id?, supplier_id?, ior_id? }, lines: [] }
  const counts = {
    haulier: { matched: 0, unmatched: 0, already: 0, empty: 0 },
    supplier: { matched: 0, unmatched: 0, already: 0, empty: 0 },
    ior: { matched: 0, unmatched: 0, already: 0, empty: 0 },
  };
  const unmatchedValues = {
    haulier: new Map(),
    supplier: new Map(),
    ior: new Map(),
  };

  for (const s of shipments) {
    const updates = {};
    const lines = [];

    for (const f of FIELDS) {
      const nameField = `${f.key}_name`;
      const idField = `${f.key}_id`;
      const name = s[nameField];
      const currentId = s[idField];

      if (currentId) {
        counts[f.key].already += 1;
        continue;
      }
      if (!name || !name.trim()) {
        counts[f.key].empty += 1;
        continue;
      }

      const result = matchName(name, lookups[f.key]);
      if (result.matched) {
        updates[idField] = result.id;
        counts[f.key].matched += 1;
        lines.push(`${f.key}='${name}' → matched ✓`);
      } else {
        counts[f.key].unmatched += 1;
        const map = unmatchedValues[f.key];
        map.set(name, (map.get(name) ?? 0) + 1);
        lines.push(`${f.key}='${name}' → unmatched`);
      }
    }

    plan.push({ id: s.id, ref: s.ref, updates, lines });
  }

  // Preview output: per-row lines for shipments with at least one
  // result of interest. Skip rows where every field was already set
  // or empty — they'd add noise.
  console.log(`Reconciling ${shipments.length} shipment(s)…\n`);
  let printed = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const p = plan[i];
    if (p.lines.length === 0) continue;
    const idx = `[${String(i + 1).padStart(String(plan.length).length, " ")}/${plan.length}]`;
    console.log(`${idx} ${p.ref}  ${p.lines.join("  ·  ")}`);
    printed += 1;
  }
  if (printed === 0) {
    console.log("(no actionable rows — every shipment is already linked or empty)");
  }
  console.log("");

  console.log("Summary by field:");
  for (const f of FIELDS) {
    const c = counts[f.key];
    console.log(
      `  ${f.key.padEnd(8)}: ${c.matched} match · ${c.unmatched} unmatched · ${c.already} already linked · ${c.empty} empty`,
    );
  }
  console.log("");

  let anyUnmatched = false;
  for (const f of FIELDS) {
    const map = unmatchedValues[f.key];
    if (map.size === 0) continue;
    anyUnmatched = true;
    console.log(`Unmatched ${f.key} values:`);
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of entries) {
      console.log(`  "${name}" (${count} shipment${count === 1 ? "" : "s"})`);
    }
    console.log(
      `  → resolve by adding rows to ${f.referencePath}, then re-run this script.`,
    );
    console.log("");
  }

  const totalUpdates = plan.filter((p) => Object.keys(p.updates).length > 0).length;
  if (totalUpdates === 0) {
    console.log("Nothing to write — every shipment with a reference name is either already linked or unmatched.");
    if (anyUnmatched) {
      console.log("Add the unmatched values to the relevant reference pages, then re-run.");
    }
    return;
  }

  console.log(
    `Will write FK updates to ${totalUpdates} shipment row${totalUpdates === 1 ? "" : "s"}.`,
  );

  const rl = createInterface({ input, output });
  const answer = (await rl.question("Proceed? [y/N] ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") {
    console.log("Aborted. No changes written.");
    return;
  }
  console.log("");

  let okCount = 0;
  let errCount = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const p = plan[i];
    if (Object.keys(p.updates).length === 0) continue;
    const idx = `[${String(i + 1).padStart(String(plan.length).length, " ")}/${plan.length}]`;
    const { error: updateError } = await supabase
      .from("shipments")
      .update(p.updates)
      .eq("id", p.id);
    if (updateError) {
      errCount += 1;
      console.log(`${idx} ${p.ref}  → DB ERROR: ${updateError.message}`);
    } else {
      okCount += 1;
      console.log(`${idx} ${p.ref}  → ✓ ${Object.keys(p.updates).join(", ")}`);
    }
  }

  console.log("");
  console.log(`Done.  ${okCount} updated, ${errCount} db errors.`);
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
