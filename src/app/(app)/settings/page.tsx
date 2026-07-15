import { Settings } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      eyebrow="Administration"
      title="Settings"
      subtitle="Organization, members, modules, and integrations."
      icon={Settings}
      headline="Configure your operation"
      paragraphs={[
        "Settings will house organization profile and plan, member roles and permissions, which modules are enabled for your tenant, and connections to external systems like FR24, AMOS, and TRAX.",
        "Role-based access is already enforced at the data layer — a viewer cannot mutate, and no org can ever see another's data. The controls to manage it arrive here.",
      ]}
    />
  );
}
