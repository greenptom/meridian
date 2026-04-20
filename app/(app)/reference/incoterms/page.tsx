import { createClient } from "@/lib/supabase/server";
import type { Incoterm } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function IncotermsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("incoterms").select("*").order("code");
  const rows = (data ?? []) as Incoterm[];

  return (
    <div>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            <em className="text-[color:var(--color-ink-soft)]">Incoterms</em> 2020
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            Reference · {rows.length} terms
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 max-[900px]:grid-cols-1 gap-4">
        {rows.map((i) => (
          <div
            key={i.code}
            className="rounded-[10px] border p-5"
            style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
          >
            <div className="flex items-baseline justify-between mb-3">
              <div className="font-mono text-[14px] tracking-wider">{i.code}</div>
              <div className="font-serif text-[16px] text-[color:var(--color-ink-soft)] italic">
                {i.full_name}
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[12.5px]">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] pt-0.5">
                Delivery
              </dt>
              <dd>{i.delivery_point}</dd>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] pt-0.5">
                Risk
              </dt>
              <dd>{i.risk_transfer}</dd>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] pt-0.5">
                Cost
              </dt>
              <dd>{i.cost_responsibility}</dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
