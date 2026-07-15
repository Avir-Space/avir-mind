import { ClipboardCheck } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Compliance" };

export default function CompliancePage() {
  return (
    <ModulePlaceholder
      eyebrow="Airworthiness"
      title="Compliance"
      subtitle="Airworthiness directives, service bulletins, and regulatory status."
      icon={ClipboardCheck}
      headline="Airworthiness, always provable"
      paragraphs={[
        "Compliance will track ADs, service bulletins, and recurring requirements against each aircraft and component — showing what's due, what's overdue, and the evidence trail behind every sign-off.",
        "The goal is an audit that takes minutes, not weeks: every requirement mapped to the exact aircraft and the record that closes it.",
      ]}
      phase={8}
    />
  );
}
