import { Command } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Command Center" };

export default function CommandCenterPage() {
  return (
    <ModulePlaceholder
      eyebrow="Operations"
      title="Command Center"
      subtitle="Your single operational picture — fleet readiness, priorities, and what needs a decision now."
      icon={Command}
      headline="Your operational picture, assembled"
      paragraphs={[
        "The Command Center will fuse live aircraft state, open work, airworthiness exposure, and crew availability into one prioritized view — so the first thing you see each morning is what actually needs you.",
        "As modules come online across the coming phases, their most decision-relevant signals will surface here. For now, your fleet and aircraft are already live — start there.",
      ]}
    />
  );
}
