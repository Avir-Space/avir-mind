import { LayoutDashboard } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Dashboards" };

export default function DashboardsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Analytics"
      title="Dashboards"
      subtitle="Configurable views across fleet health, reliability, and operations."
      icon={LayoutDashboard}
      headline="The metrics that matter, your way"
      paragraphs={[
        "Dashboards will let each team assemble the KPIs they care about — dispatch reliability, maintenance throughput, inventory exposure, compliance posture — from the same trusted underlying data.",
        "Every tile will carry the same source and confidence indicators you see across AVIR, so a number on a dashboard is always as trustworthy as the state behind it.",
      ]}
    />
  );
}
