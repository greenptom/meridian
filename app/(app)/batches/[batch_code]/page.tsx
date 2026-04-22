import { notFound } from "next/navigation";
import Link from "next/link";
import { getBatchBySlug } from "@/lib/actions/batches";
import { BatchDetailView } from "@/components/batches/batch-detail";

export const dynamic = "force-dynamic";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batch_code: string }>;
}) {
  const { batch_code } = await params;
  const decoded = decodeURIComponent(batch_code);
  const data = await getBatchBySlug(decoded);
  if (!data) notFound();

  return (
    <>
      <div className="mb-6">
        <Link
          href="/batches"
          className="font-mono text-[11px] uppercase tracking-widest text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)]"
        >
          ← All batches
        </Link>
      </div>
      <BatchDetailView data={data} />
    </>
  );
}
