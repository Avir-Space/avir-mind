export type CrewMember = {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: string | null;
  home_base_station: string | null;
  hire_date: string | null;
  primary_jurisdiction: string | null;
  seniority_number: number | null;
  employment_status: string;
};

export type CrewDirectoryItem = CrewMember & {
  qual_count: number;
  currency_issues: number;
  expiring_soon: number;
  next_duty: string | null;
};

export type CrewQual = {
  id: string;
  qualification_code: string;
  qualification_name: string;
  qualification_type: string | null;
  applicable_aircraft_types: string[] | null;
  issued_date: string;
  expiry_date: string | null;
  status: string;
  last_currency_event_date: string | null;
  currency_details: Record<string, unknown> | null;
  days_to_expiry: number | null;
};

export type DutyPeriod = {
  id: string;
  duty_type: string;
  start_utc: string;
  end_utc: string;
  station_from: string | null;
  station_to: string | null;
  flight_time_minutes: number | null;
  night_operations?: boolean;
  status: string;
};

export type ComplianceRecord = {
  overall_result: string;
  warnings: string[] | null;
  violations: string[] | null;
  fatigue_score: number | null;
  evaluated_at_utc: string;
};

export type CrewDetail = {
  member: CrewMember & { date_of_birth: string | null; notes: string | null };
  qualifications: CrewQual[];
  duty_history: DutyPeriod[];
  upcoming: DutyPeriod[];
  compliance: ComplianceRecord[];
};

export type CrewStats = {
  active_total: number;
  by_role: Record<string, number>;
  currency_issues: number;
  expiring_30d: number;
  fatigue_risk: number;
  rest_violations_week: number;
};

export type RosterCrew = { id: string; first_name: string; last_name: string; role: string | null; home_base_station: string | null; employee_id: string };
export type RosterDuty = { crew_member_id: string; duty_type: string; start_utc: string; end_utc: string; day: string; station_from: string | null; station_to: string | null; status: string };
export type RosterData = { start_date: string; end_date: string; crew: RosterCrew[]; duties: RosterDuty[] };

export type ExpiringQual = {
  id: string;
  crew_member_id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  qualification_code: string;
  qualification_name: string;
  expiry_date: string;
  status: string;
  days_to_expiry: number;
};

export type FatigueForecast = { crew_member_id: string; forecast: { date: string; fatigue_score: number; elevated: boolean }[] };

export type RuleEvaluation = { rule_name: string; threshold: number; projected: number; margin: number; result: string };

export type DutyEvaluation = {
  result_id: string;
  rule_config: string;
  regulator: string | null;
  overall_result: string;
  rule_evaluations: RuleEvaluation[];
  warnings: string[];
  violations: string[];
  fatigue_score: number;
  cumulative_projections: Record<string, number | null>;
};

export type CurrencyCheck = {
  aircraft_type: string | null;
  required: { qualification_code: string; qualification_name: string; held: boolean; current: boolean; expiry_date: string | null; status: string | null }[];
  missing: unknown[];
  expired: unknown[];
  assignable: boolean;
};

export type ProposeResult = { duty_evaluation: DutyEvaluation; currency: CurrencyCheck; assignable: boolean };

export type RuleConfig = {
  id: string;
  rule_config_name: string;
  regulator: string;
  cba_overlay_name: string | null;
  rule_stack: Record<string, unknown>;
  applicable_roles: string[] | null;
  effective_from: string;
  is_active: boolean;
};

export type CrewOverlay = {
  aircraft: { aircraft_id: string; crew_status: string }[];
  stations: { station_code: string; crew_available: number }[];
};
