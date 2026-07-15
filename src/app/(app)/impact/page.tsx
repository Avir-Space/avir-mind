import { TrendingUp } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Impact" };

export default function ImpactPage() {
  return (
    <ModulePlaceholder
      eyebrow="Value"
      title="Impact"
      subtitle="The measurable operational and financial value AVIR is creating."
      icon={TrendingUp}
      headline="Value, made measurable"
      paragraphs={[
        "Impact will quantify the outcomes AVIR drives — avoided AOG hours, recovered dispatch availability, reduced admin time, and the dollars behind each — attributed to specific decisions and events.",
        "It turns the platform from a system of record into a system of proof, showing exactly where the return is coming from.",
      ]}
    />
  );
}
