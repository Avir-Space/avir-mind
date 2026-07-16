import type { PredictiveEvent } from "@/types/components";

export type MaxSeverity = "critical" | "high" | "medium" | "low" | "info" | "insufficient_data" | null;

export type AircraftPosition = {
  aircraft_id: string;
  tail_number: string;
  aircraft_type: string;
  /** Display state incl. derived "aog"; one of in_air|on_ground|under_maintenance|stationed|aog|unknown. */
  state: string;
  lat: number | null;
  lng: number | null;
  station: string | null;
  active_signals_count: number;
  max_severity: MaxSeverity;
  primary_task_title: string | null;
};

export type StationRollup = {
  station_code: string;
  aircraft_on_ground: number;
  aircraft_inbound: number;
  active_signals_count: number;
  dispatch_blocking_count: number;
  predictive_alerts_count: number;
  weather: null;
};

export type TimelineEventKind = "departure" | "arrival" | "signal";

export type TimelineEvent = {
  aircraft_id: string;
  tail_number: string;
  event_type: TimelineEventKind;
  event_time_utc: string;
  event_detail_json: {
    kind: TimelineEventKind;
    flight_number?: string | null;
    origin?: string;
    destination?: string;
    status?: string;
    delay_minutes?: number;
    signal_id?: string;
    severity?: string;
    title?: string;
  };
};

export type CommandCenterSnapshot = {
  generated_at: string;
  time_window_hours: number;
  aircraft_positions: AircraftPosition[];
  station_rollups: StationRollup[];
  timeline_events: TimelineEvent[];
  predictive_events: PredictiveEvent[];
};

export type DrawerPrimaryTask = {
  task_id: string;
  title: string;
  risk_band: string;
  dispatch_blocking: boolean;
  aog: boolean;
  status: string;
  assignee_user_id: string | null;
};

export type DrawerSignal = { signal_id: string; severity: string; title: string };

export type DrawerFlight = {
  flight_number: string | null;
  origin: string;
  destination: string;
  scheduled_departure_utc: string;
  scheduled_arrival_utc: string;
  status: string;
};

export type AircraftDrawerSummary = {
  aircraft_id: string;
  tail_number: string;
  aircraft_type: string;
  base_station: string | null;
  ownership_type: string | null;
  state: string;
  current_station: string | null;
  state_confidence: string | null;
  state_source: string | null;
  last_transition_at: string | null;
  next_event_type: string | null;
  next_event_at: string | null;
  active_signals_count: number;
  active_tasks_count: number;
  dispatch_blocking_count: number;
  primary_task: DrawerPrimaryTask | null;
  top_signals: DrawerSignal[];
  next_flights: DrawerFlight[];
  next_flight: DrawerFlight | null;
};

export type StationDrawerAircraft = {
  aircraft_id: string;
  tail_number: string;
  aircraft_type: string;
  state: string;
};

export type StationDrawerSignal = DrawerSignal & { tail_number: string };

export type StationDrawerSummary = {
  station_code: string;
  aircraft_on_ground: number;
  aircraft_inbound: number;
  aircraft_outbound_6h: number;
  aircraft_here: StationDrawerAircraft[];
  active_signals_count: number;
  top_signals: StationDrawerSignal[];
};

/** What the universal right-side drawer is currently showing. */
export type DrawerTarget =
  | { kind: "aircraft"; aircraftId: string; tail: string }
  | { kind: "station"; stationCode: string }
  | { kind: "event"; event: TimelineEvent }
  | { kind: "prediction"; prediction: PredictiveEvent }
  | null;
