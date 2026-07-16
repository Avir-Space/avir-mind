export type ComponentStatus = "on_wing" | "off_wing_inventory" | "off_wing_repair" | "scrapped";

export type ComponentRow = {
  id: string;
  org_id: string;
  aircraft_id: string | null;
  component_type: string;
  part_number: string;
  serial_number: string;
  position_code: string | null;
  manufacturer: string | null;
  installed_at_utc: string | null;
  removed_at_utc: string | null;
  current_cycles: number | null;
  current_flight_hours: number | null;
  cycles_since_new: number | null;
  flight_hours_since_new: number | null;
  cycles_since_overhaul: number | null;
  flight_hours_since_overhaul: number | null;
  limit_cycles: number | null;
  limit_flight_hours: number | null;
  overhaul_interval_cycles: number | null;
  overhaul_interval_hours: number | null;
  next_scheduled_event_type: string | null;
  next_scheduled_event_due_cycles: number | null;
  next_scheduled_event_due_hours: number | null;
  next_scheduled_event_due_date: string | null;
  status: ComponentStatus;
  health_score: number | null;
  health_score_updated_at_utc: string | null;
};

/** List row = component + tail + active-prediction count. */
export type ComponentListItem = ComponentRow & {
  tail_number: string | null;
  active_predictions: number;
};

export type ComponentEvent = {
  id: string;
  component_id: string;
  aircraft_id: string | null;
  event_type: string;
  event_date_utc: string;
  cycles_at_event: number | null;
  flight_hours_at_event: number | null;
  finding_severity: string | null;
  finding_description: string | null;
  station: string | null;
  facility: string | null;
  performed_by: string | null;
  documentation_reference: string | null;
  cost_usd: number | null;
  linked_task_id: string | null;
  linked_signal_id: string | null;
  source_system: string;
  source_reference_id: string | null;
  created_at_utc: string;
};

export type HealthPoint = {
  health_score: number;
  score_contributors: Record<string, unknown> | null;
  computed_at_utc: string;
};

export type PredictionHorizon = {
  lower_bound_hours?: number;
  upper_bound_hours?: number;
  lower_bound_cycles?: number;
  upper_bound_cycles?: number;
  lower_bound_date?: string;
  upper_bound_date?: string;
  unit_preference?: string;
};

export type PredictiveSignal = {
  id: string;
  component_id: string | null;
  aircraft_id: string | null;
  signal_class: string;
  severity: string;
  title: string;
  narrative: string;
  recommendation: string | null;
  confidence: string;
  confidence_reasoning: string;
  predicted_event_type: string | null;
  prediction_horizon: PredictionHorizon | null;
  historical_baseline: Record<string, unknown> | null;
  accuracy_result: string;
  evidence_refs: { primary?: unknown[]; supporting?: unknown[] };
  is_active: boolean;
  generated_at_utc: string;
  generated_by_model: string;
};

export type ComponentDetail = {
  component: ComponentRow | null;
  aircraft: { id: string; tail_number: string; aircraft_type: string } | null;
  events: ComponentEvent[];
  health_history: HealthPoint[];
  predictions: PredictiveSignal[];
};

/** Predictive marker for the Command Center timeline. */
export type PredictiveEvent = {
  aircraft_id: string;
  tail_number: string;
  signal_id: string;
  severity: string;
  title: string;
  predicted_event_type: string | null;
  component_id: string | null;
  lower_date: string | null;
  upper_date: string | null;
  prediction_horizon: PredictionHorizon | null;
};
