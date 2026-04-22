import {
  listBatchesWithSummary,
  listEligibleSources,
} from "@/lib/actions/batches";
import { BatchesView } from "@/components/batches/batches-view";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const [batches, eligibleSources] = await Promise.all([
    listBatchesWithSummary(),
    listEligibleSources(),
  ]);
  return <BatchesView batches={batches} eligibleSources={eligibleSources} />;
}
