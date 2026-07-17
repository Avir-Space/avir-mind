/** Phase 9 — calibration RPC return shapes. */

export type CalStats = {
  overall_accuracy_pct: number | null;
  weighted_accuracy_pct: number | null;
  total_measured: number;
  total_signals: number;
  coverage_pct: number | null;
  action_rate_pct: number | null;
  dismissal_rate_pct: number | null;
};

export type CatRow = {
  signal_category: string;
  total_signals: number;
  measured: number;
  correct: number;
  partial: number;
  incorrect: number;
  accuracy_pct: number | null;
  sample_size_status: string;
};

export type ConfRow = {
  confidence_level: string;
  total_signals: number;
  measured: number;
  correct: number;
  incorrect: number;
  accuracy_pct: number | null;
};

export type ModelRow = {
  model_identifier: string;
  total_signals: number;
  measured: number;
  correct: number;
  accuracy_pct: number | null;
};

export type ClassRow = {
  signal_class: string;
  total_signals: number;
  measured: number;
  accuracy_pct: number | null;
  coverage_pct: number | null;
};

export type GridCell = {
  signal_category: string;
  confidence_level: string;
  total_signals: number;
  measured: number;
  correct: number;
  partial: number;
  incorrect: number;
  accuracy_pct: number | null;
  sample_size_status: string;
};

export type CalibrationDashboard = {
  has_data: boolean;
  window_days?: number;
  snapshot_date?: string;
  stats?: CalStats;
  delta_vs_prior?: number | null;
  by_category?: CatRow[];
  by_confidence?: ConfRow[];
  by_model?: ModelRow[];
  by_class?: ClassRow[];
  grid?: GridCell[];
};

export type SampleSignal = { id: string; title: string; confidence: string; generated_at_utc: string };

export type CategoryDetail = {
  category: string;
  window_days: number;
  history: Array<{ snapshot_date: string; measured: number; accuracy_pct: number | null }>;
  by_model: Array<{ model_identifier: string; measured: number; accuracy_pct: number | null }>;
  samples: { correct: SampleSignal[]; partial: SampleSignal[]; incorrect: SampleSignal[] };
};

export type TrendPoint = {
  snapshot_date: string;
  accuracy_pct: number | null;
  high_conf_accuracy_pct: number | null;
  measured: number;
};

export type CalBadge = { accuracy_pct: number; measured: number; sample_size_status: string };
export type CalBadgeMap = Record<string, CalBadge>;

export type ScoreboardNarrative = {
  overall_narrative?: string;
  category_narratives?: Record<string, string>;
  areas_of_strength?: string[];
  areas_needing_improvement?: string[];
  methodology_notes?: string;
};

export type ScoreboardListRow = {
  id: string;
  scoreboard_name: string;
  scoreboard_type: string;
  window_days: number;
  summary_stats: Record<string, unknown> | null;
  is_published: boolean;
  published_at_utc: string | null;
  generated_at_utc: string;
};

export type Scoreboard = {
  id: string;
  scoreboard_name: string;
  scoreboard_type: string;
  org_id: string | null;
  window_days: number;
  summary_stats: Record<string, unknown> | null;
  narrative: ScoreboardNarrative | null;
  confidence_notes: Record<string, unknown> | null;
  is_published: boolean;
  published_at_utc: string | null;
  generated_at_utc: string;
};

export type PublicationRow = {
  id: string;
  scoreboard_id: string;
  scoreboard_name: string;
  window_days: number;
  publication_channel: string;
  published_at_utc: string;
  publication_content_hash: string;
  publication_url: string | null;
};
