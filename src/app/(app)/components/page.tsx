import { Cpu } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Components" };

export default function ComponentsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Airworthiness"
      title="Components"
      subtitle="Rotable and life-limited part genealogy across your fleet."
      icon={Cpu}
      headline="Every part, traced to its aircraft"
      paragraphs={[
        "Components will track serialized and life-limited parts through installs, removals, and transfers — with full genealogy, remaining life, and the aircraft each part is on right now.",
        "This becomes the backbone for airworthiness compliance and reliability analysis, connecting maintenance events to the exact hardware involved.",
      ]}
    />
  );
}
