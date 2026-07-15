import { Package } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <ModulePlaceholder
      eyebrow="Supply Chain"
      title="Inventory"
      subtitle="Parts, stock levels, and spares positioning across your stations."
      icon={Package}
      headline="Stock, positioned where it's needed"
      paragraphs={[
        "Inventory will give you real-time stock by station, reorder thresholds, and the spares exposure behind every AOG risk — so a missing part never becomes a grounded aircraft.",
        "It links directly to components and maintenance, turning parts availability into an operational signal rather than a spreadsheet lookup.",
      ]}
      phase={5}
    />
  );
}
