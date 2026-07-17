/** Phase 10 — backtest RPC shapes. */

export type BacktestProject = {
  id: string;
  org_id: string;
  project_name: string;
  customer_organization_name: string | null;
  purpose: string | null;
  status: string;
  data_period_start: string | null;
  data_period_end: string | null;
  notes: string | null;
  created_at_utc: string;
  updated_at_utc: string;
  source_count?: number;
  last_run_cost?: number | null;
};

export type DataSource = {
  id: string;
  source_type: string;
  source_file_name: string;
  source_file_size_bytes: number | null;
  rows_ingested: number | null;
  ingestion_errors: unknown;
  ingested_at_utc: string | null;
  created_at_utc: string;
};

export type BacktestRun = {
  id: string;
  run_type: string | null;
  status: string;
  started_at_utc: string;
  completed_at_utc: string | null;
  signals_generated_count: number;
  actual_events_matched_count: number;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_usd: number | null;
  error_summary: string | null;
};

export type Readiness = {
  ready: boolean;
  sources: number;
  reconstructed_states: number;
  actual_events: number;
  warnings: string[];
};

export type ProjectDetail = {
  project: BacktestProject;
  data_sources: DataSource[];
  runs: BacktestRun[];
  readiness: Readiness;
};

export type BacktestSummary = {
  total_simulated_signals: number;
  total_actual_events: number;
  matched_events: number;
  would_have_caught_pct: number;
  missed_events: number;
  avg_lead_time_days: number;
  false_positive_signals: number;
  by_category: { category: string; signals: number; matched: number }[];
};

export type SimulatedSignal = {
  id: string;
  simulated_signal_class: string | null;
  simulated_signal_category: string;
  simulated_severity: string | null;
  simulated_confidence: string | null;
  would_have_fired_at_utc: string;
  entity_external_id: string | null;
  title: string | null;
  narrative: string | null;
  match_confidence: string | null;
  match_lead_time_days: number | null;
  matched_actual_event_id: string | null;
  model_identifier: string | null;
};

export type ActualEvent = {
  id: string;
  actual_event_type: string;
  actual_event_time_utc: string;
  entity_external_id: string;
  event_description: string | null;
  severity_at_occurrence: string | null;
  was_predictable_in_hindsight: boolean | null;
  caught: boolean;
};

export type CategoryDetail = {
  category: string;
  signals: Array<{
    id: string; title: string | null; confidence: string | null; would_have_fired_at_utc: string;
    entity_external_id: string | null; match_confidence: string | null; match_lead_time_days: number | null; matched_actual_event_id: string | null;
  }>;
  caught_events: Array<{ id: string; type: string; time: string; entity: string; description: string | null }>;
  missed_events: Array<{ id: string; type: string; time: string; entity: string; description: string | null }>;
};

export type BacktestReport = {
  id: string;
  report_type: string;
  generated_at_utc: string;
  summary_stats: BacktestSummary;
  narrative: {
    headline?: string;
    methodology?: string;
    key_findings?: Array<{ title: string; simulated_signal_category: string; match_lead_time_days: number; entity_external_id: string; actual_event_type: string; event_description: string }>;
    limitations?: string;
  };
  content_hash: string;
  shared_with: unknown;
};
