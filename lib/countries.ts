// Canonical country codes for the ~15 countries likely to appear in Grind's
// shipments. The map is keyed on lowercased free-text forms (full name,
// common abbreviations, ISO alpha-2 and alpha-3) and returns the ISO
// alpha-2 code as the canonical value. Anything unrecognised passes
// through uppercased so the comparison still works for exotic values.
const CANONICAL: Record<string, string> = {
  "united kingdom": "GB",
  "uk": "GB",
  "u.k.": "GB",
  "great britain": "GB",
  "britain": "GB",
  "england": "GB",
  "gb": "GB",
  "gbr": "GB",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "u.s.a.": "US",
  "u.s.": "US",
  "us": "US",
  "america": "US",
  "germany": "DE",
  "deutschland": "DE",
  "de": "DE",
  "deu": "DE",
  "france": "FR",
  "fr": "FR",
  "fra": "FR",
  "italy": "IT",
  "italia": "IT",
  "it": "IT",
  "ita": "IT",
  "spain": "ES",
  "españa": "ES",
  "espana": "ES",
  "es": "ES",
  "esp": "ES",
  "netherlands": "NL",
  "the netherlands": "NL",
  "holland": "NL",
  "nl": "NL",
  "nld": "NL",
  "ireland": "IE",
  "ie": "IE",
  "irl": "IE",
  "portugal": "PT",
  "pt": "PT",
  "prt": "PT",
  "poland": "PL",
  "pl": "PL",
  "pol": "PL",
  "czech republic": "CZ",
  "czechia": "CZ",
  "cz": "CZ",
  "cze": "CZ",
  "brazil": "BR",
  "brasil": "BR",
  "br": "BR",
  "bra": "BR",
  "colombia": "CO",
  "co": "CO",
  "col": "CO",
  "ethiopia": "ET",
  "et": "ET",
  "eth": "ET",
  "kenya": "KE",
  "ke": "KE",
  "ken": "KE",
  "vietnam": "VN",
  "viet nam": "VN",
  "vn": "VN",
  "vnm": "VN",
};

export function canonicalCountry(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return CANONICAL[key] ?? raw.trim().toUpperCase();
}

export function isUK(raw: string | null | undefined): boolean {
  return canonicalCountry(raw) === "GB";
}
