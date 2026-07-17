/** Phase 8 — compliance + DS.AI RPC return shapes (JSON from RPCs). */

export type ComplianceStats = {
  ads_open: number;
  ads_due_30: number;
  mel_deferred: number;
  mel_approaching: number;
  llps_approaching: number;
  sbs_open: number;
  reports_open: number;
};

export type ADRow = {
  id: string;
  ad_number: string;
  issuing_authority: string;
  ad_title: string;
  criticality: string;
  effective_date: string;
  compliance_deadline_date: string | null;
  applicable_aircraft_types: string[];
  tracked: number;
  complied: number;
  open_count: number;
  deferred_count: number;
};

export type SBRow = {
  id: string;
  sb_number: string;
  manufacturer: string;
  sb_title: string;
  classification: string;
  issued_date: string;
  recommended_by_date: string | null;
  applicable_aircraft_types: string[];
  complied: number;
  open_count: number;
};

export type ComplianceDashboard = { stats: ComplianceStats; ads: ADRow[]; sbs: SBRow[] };

export type ADMatrixRow = {
  aircraft_id: string;
  tail_number: string;
  aircraft_type: string;
  status: string;
  compliance_method: string | null;
  complied_at_date: string | null;
  deferral_authority: string | null;
  deferral_expiry_date: string | null;
  documentation_reference: string | null;
  notes: string | null;
};
export type ADDetail = { ad: Record<string, unknown>; matrix: ADMatrixRow[] };

export type MelItem = {
  id: string;
  aircraft_id: string;
  tail_number: string;
  aircraft_type: string;
  mel_item_number: string;
  ata_chapter: string | null;
  system_name: string;
  item_description: string;
  category: string;
  operational_procedure: string | null;
  maintenance_procedure: string | null;
  status: string;
  reason: string | null;
  deferred_at_utc: string;
  repair_by_date: string;
  placard_installed: boolean;
  extension_authority: string | null;
  linked_task_id: string | null;
  days_remaining: number;
};

export type LlpRow = {
  id: string;
  component_id: string;
  part_number: string;
  serial_number: string;
  component_type: string;
  aircraft_id: string | null;
  tail_number: string | null;
  aircraft_type: string | null;
  life_limit_type: string;
  life_limit_value: number;
  current_value: number;
  remaining: number;
  percentage_used: number;
  criticality: string;
  source_document: string | null;
  updated_at_utc: string;
};

export type RegReport = {
  id: string;
  report_type: string;
  issuing_regulator: string | null;
  report_reference: string | null;
  filed_at_date: string | null;
  linked_event_id: string | null;
  report_summary: string | null;
  status: string;
  follow_up_actions: unknown;
  created_at_utc: string;
};

export type AircraftComplianceSummary = {
  ads: Array<{
    ad_id: string; ad_number: string; issuing_authority: string; ad_title: string; criticality: string;
    effective_date: string; compliance_deadline_date: string | null; status: string;
    compliance_method: string | null; complied_at_date: string | null; deferral_expiry_date: string | null;
  }>;
  sbs: Array<{
    sb_id: string; sb_number: string; manufacturer: string; sb_title: string; classification: string;
    issued_date: string; recommended_by_date: string | null; status: string;
  }>;
  mel: Array<{
    id: string; mel_item_number: string; system_name: string; item_description: string; category: string;
    status: string; deferred_at_utc: string; repair_by_date: string; placard_installed: boolean; linked_task_id: string | null;
  }>;
  llps: Array<{
    id: string; part_number: string; serial_number: string; component_type: string; life_limit_type: string;
    life_limit_value: number; current_value: number; remaining: number; percentage_used: number; criticality: string;
  }>;
};

// ── DS.AI ──
export type DsaiStats = {
  decisions_this_month: number;
  oversight_rate: number;
  decisions_all_time: number;
  model_versions: number;
  data_sources: number;
};

export type DecisionRow = {
  id: string;
  decision_type: string;
  decision_context: string | null;
  model_identifier: string;
  output_confidence: string | null;
  input_context_hash: string;
  output_content: Record<string, unknown> | null;
  decision_at_utc: string;
  linked_signal_id: string | null;
  linked_task_id: string | null;
  reviewed: boolean;
  lineage_count: number;
};

export type OversightRow = {
  id: string;
  oversight_type: string;
  reviewer_role: string | null;
  outcome_matched_ai: boolean | null;
  created_at_utc: string;
  decision_type: string;
  model_identifier: string;
  linked_signal_id: string | null;
  signal_title: string | null;
};

export type ModelVersionRow = {
  id: string;
  model_identifier: string;
  provider: string;
  version_number: string | null;
  released_at_utc: string | null;
  deployed_from_utc: string;
  deployed_to_utc: string | null;
  deployment_notes: string | null;
  known_limitations: string[] | null;
  decision_count: number;
};

export type PromptVersionRow = {
  prompt_template_identifier: string;
  prompt_template_hash: string;
  version_number: number;
  deployed_from_utc: string;
  deployed_to_utc: string | null;
  change_summary: string | null;
  prompt_preview: string;
};

export type ModelVersionReport = { models: ModelVersionRow[]; prompts: PromptVersionRow[] };

export type AuditTrail = {
  decision: DecisionRow & Record<string, unknown>;
  model: Record<string, unknown> | null;
  prompt: Record<string, unknown> | null;
  lineage: Array<{
    id: string; source_table: string; source_row_id: string;
    source_data_snapshot: Record<string, unknown> | null; source_data_generated_by: string | null;
  }>;
  oversight: Array<{
    id: string; oversight_type: string; reviewer_role: string | null; outcome_matched_ai: boolean | null; created_at_utc: string;
  }>;
} | null;

export type ConformanceBundle = Record<string, unknown>;
