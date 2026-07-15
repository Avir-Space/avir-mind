import { PlaneTakeoff } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Flight Ops" };

export default function FlightOpsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Operations"
      title="Flight Ops"
      subtitle="Schedules, movements, and dispatch readiness across the network."
      icon={PlaneTakeoff}
      headline="Movements, matched to readiness"
      paragraphs={[
        "Flight Ops will bring schedules and live movements alongside each aircraft's true dispatch state — so a scheduled departure is always checked against whether the tail is actually ready to fly.",
        "It becomes the operational heartbeat that maintenance, crew, and compliance all reconcile against.",
      ]}
      phase={7}
    />
  );
}
