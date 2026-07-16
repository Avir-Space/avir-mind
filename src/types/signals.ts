// Shapes returned by the Phase 2 signal RPCs.

export type SignalSeverity = "critical" | "high" | "medium" | "low" | "info" | "insufficient_data";
export type SignalConfidence = "high" | "medium" | "low";

export type EvidenceRef = {
  type: string;
  id?: string;
  reference?: string;
  summary: string;
};

export type EvidenceRefs = {
  primary?: EvidenceRef[];
  supporting?: EvidenceRef[];
};

export type SuggestedAction = {
  label: string;
  description: string;
};

export type Signal = {
  id: string;
  aircraft_id: string | null;
  category: string;
  severity: SignalSeverity;
  title: string;
  narrative: string;
  recommendation: string | null;
  confidence: SignalConfidence;
  confidence_reasoning: string;
  evidence_refs: EvidenceRefs;
  suggested_actions: SuggestedAction[];
  is_active: boolean;
  generated_at_utc: string;
  generated_by_model: string;
  my_last_action: string | null;
  action_counts: Record<string, number>;
};

export type GenerationRun = {
  id: string;
  status: "started" | "completed" | "failed";
  generated_at_utc: string | null;
  started_at_utc: string;
  signals_generated: number;
  error: string | null;
};

export type SignalsResponse = {
  signals: Signal[];
  latest_run: GenerationRun | null;
  next_regeneration_available_at: string | null;
};

export type Insight = {
  category: string;
  severity: SignalSeverity;
  title: string;
  one_liner: string;
  aircraft_count: number | null;
  signal_count: number | null;
  drill_in_query: Record<string, unknown>;
};

export type SignalAction = {
  id: string;
  signal_id: string;
  action_type: string;
  actor_user_id: string;
  created_at_utc: string;
  dismissal_reason: string | null;
  signal_title?: string;
};
