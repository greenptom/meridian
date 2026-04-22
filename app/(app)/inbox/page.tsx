import { ComingSoon } from "@/components/ui/coming-soon";

export default function InboxPage() {
  return (
    <ComingSoon
      title="Email"
      italic="inbox"
      phase="Coming later"
      description="Emails forwarded to shipments@[your-domain] appear here with attachments extracted into draft shipments."
    />
  );
}
