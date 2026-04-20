import { ComingSoon } from "@/components/ui/coming-soon";

export default function DraftsPage() {
  return (
    <ComingSoon
      title="Drafts"
      italic="& pending"
      phase="Arrives in Phase 2"
      description="Draft shipments created from document uploads and email ingest, awaiting your review before going active."
    />
  );
}
