import { Users } from "lucide-react";

import { ModulePlaceholder } from "@/components/avir/module-placeholder";

export const metadata = { title: "Crew" };

export default function CrewPage() {
  return (
    <ModulePlaceholder
      eyebrow="People"
      title="Crew"
      subtitle="Qualifications, currency, and availability for flight and maintenance crew."
      icon={Users}
      headline="The right people, current and available"
      paragraphs={[
        "Crew will track certifications, type ratings, currency windows, and duty availability — surfacing who can legally and practically cover a given assignment.",
        "Paired with flight ops and maintenance, it closes the loop between an aircraft being ready and a crew being ready to operate it.",
      ]}
      phase={6}
    />
  );
}
