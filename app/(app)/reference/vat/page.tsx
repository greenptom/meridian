import { createClient } from "@/lib/supabase/server";
import type { VatRegistration } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VatPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("vat_registrations").select("*").order("country_code");
  const rows = (data ?? []) as VatRegistration[];

  return (
    <div>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            VAT <em className="text-[color:var(--color-ink-soft)]">registrations</em>
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {rows.length} jurisdictions
          </div>
        </div>
      </header>

      <div
        className="rounded-[10px] border overflow-hidden"
        style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
      >
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Country", "Type", "VAT number", "Filing", "Managed by", "Status", "Note"].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-[color:var(--color-ink-faint)] border-b"
                  style={{
                    background: "var(--color-paper-warm)",
                    borderColor: "var(--color-line)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const flagged = r.comment === "Query on hold" || r.status === "Not with AVASK";
              return (
                <tr key={r.country_code} style={{ borderBottom: "1px solid var(--color-line-soft)" }}>
                  <td className="px-4 py-3.5 font-mono font-medium">{r.country_code}</td>
                  <td className="px-4 py-3.5">{r.registration_type}</td>
                  <td className="px-4 py-3.5 font-mono text-[12px]">{r.vat_number}</td>
                  <td className="px-4 py-3.5">{r.filing_period}</td>
                  <td className="px-4 py-3.5">{r.managed_by_avask ? "AVASK" : "In-house"}</td>
                  <td className="px-4 py-3.5">
                    <span className={`status ${flagged ? "status-review" : "status-active"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[color:var(--color-ink-soft)] text-[12px]">
                    {r.comment ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
