import { createClient } from "@/lib/supabase/server";
import type { CommodityCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CommodityPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("commodity_codes").select("*").order("product_type");
  const rows = (data ?? []) as CommodityCode[];

  return (
    <div>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            Commodity <em className="text-[color:var(--color-ink-soft)]">codes</em>
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            UK/EU tariff reference · {rows.length} products
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
              {["Product", "Code", "Tariff description"].map((h) => (
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
            {rows.map((r) => (
              <tr key={r.code} style={{ borderBottom: "1px solid var(--color-line-soft)" }}>
                <td className="px-4 py-3.5 font-medium">{r.product_type}</td>
                <td className="px-4 py-3.5 font-mono text-[12px]">{r.code}</td>
                <td className="px-4 py-3.5 text-[color:var(--color-ink-soft)]">{r.tariff_description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
