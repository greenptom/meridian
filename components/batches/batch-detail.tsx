import type { BatchDetailData } from "@/lib/actions/batches";
import { formatCurrency } from "@/lib/utils";
import { ClientTime } from "@/components/ui/client-time";

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function BatchDetailView({ data }: { data: BatchDetailData }) {
  const { batch, sources, blended_cost } = data;

  const totalSourceQty = sources.reduce((a, s) => a + s.quantity_used, 0);
  const pending = sources.filter((s) => s.missing_cost_fields.length > 0);

  return (
    <>
      <header
        className="flex justify-between items-end pb-6 mb-7 border-b max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-4"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div>
          <div className="font-mono text-[11px] text-[color:var(--color-ink-faint)] tracking-wider mb-1">
            {batch.batch_code} · created <ClientTime iso={batch.created_at} mode="date" />
          </div>
          <h1 className="font-serif text-[38px] leading-none tracking-tight font-normal">
            {batch.blend_name ?? (
              <em className="text-[color:var(--color-ink-soft)]">Unnamed blend</em>
            )}
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mt-2.5">
            {batch.quantity_produced != null
              ? `${batch.quantity_produced} ${batch.quantity_unit}`
              : "—"}{" "}
            · {sources.length} source
            {sources.length === 1 ? "" : "s"} · Roasted{" "}
            {formatDateOnly(batch.roasted_date)}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_300px] max-[900px]:grid-cols-1 gap-6">
        <section
          className="rounded-[10px] border overflow-hidden"
          style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
        >
          <div
            className="px-[22px] py-4 border-b font-serif text-[20px] font-medium tracking-tight"
            style={{ borderColor: "var(--color-line-soft)" }}
          >
            Source <em className="text-[color:var(--color-ink-soft)] font-normal">shipments</em>
          </div>
          {sources.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-[color:var(--color-ink-faint)] italic">
              No sources recorded.
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Ref", "Route", "Qty used", "Per unit landed", "Contribution"].map(
                    (h) => (
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
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr
                    key={s.use_id}
                    style={{ borderBottom: "1px solid var(--color-line-soft)" }}
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[12px] text-[color:var(--color-ink-soft)]">
                        {s.ref}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-medium">
                        {s.origin_country ?? "—"}
                      </span>
                      <span className="text-[color:var(--color-ink-faint)] text-[11px] mx-1.5">
                        →
                      </span>
                      <span className="font-medium">
                        {s.destination_country ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px]">
                      {s.quantity_used} {s.quantity_unit}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px]">
                      {s.per_unit_landed != null
                        ? formatCurrency(s.per_unit_landed, "GBP", 4)
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px]">
                      {s.total_contribution != null
                        ? formatCurrency(s.total_contribution, "GBP", 2)
                        : "—"}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--color-paper-warm)" }}>
                  <td className="px-4 py-3" colSpan={2}>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
                      Total
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]">
                    {totalSourceQty} {batch.quantity_unit}
                  </td>
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <aside
          className="rounded-[10px] border p-6 self-start"
          style={{ background: "var(--color-card)", borderColor: "var(--color-line)" }}
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mb-3">
            Blended cost / {batch.quantity_unit}
          </div>
          {blended_cost != null ? (
            <div className="font-serif text-[28px] tracking-tight">
              {formatCurrency(blended_cost, "GBP", 4)}
            </div>
          ) : (
            <div
              className="rounded px-3 py-3"
              style={{
                background: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              <div className="font-mono text-[11px] uppercase tracking-widest mb-2">
                Pending landed costs
              </div>
              {pending.length > 0 ? (
                <ul className="text-[12px] leading-relaxed list-disc pl-4">
                  {pending.map((s) => (
                    <li key={s.use_id}>
                      <span className="font-mono">{s.ref}</span>
                      {": missing "}
                      {s.missing_cost_fields.join(", ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[12px]">
                  No sources recorded.
                </div>
              )}
            </div>
          )}
          {batch.notes && (
            <div className="mt-5 pt-5 border-t" style={{ borderColor: "var(--color-line-soft)" }}>
              <div className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)] mb-2">
                Notes
              </div>
              <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                {batch.notes}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
