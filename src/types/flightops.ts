export type Flight = {
  id: string;
  flight_number: string;
  flight_date: string;
  aircraft_id: string | null;
  origin_station: string;
  destination_station: string;
  alternate_stations: string[] | null;
  scheduled_departure_utc: string;
  scheduled_arrival_utc: string;
  estimated_departure_utc: string | null;
  estimated_arrival_utc: string | null;
  actual_out_utc: string | null;
  actual_off_utc: string | null;
  actual_on_utc: string | null;
  actual_in_utc: string | null;
  status: string;
  delay_minutes: number;
  delay_codes: string[] | null;
  cancellation_reason: string | null;
  diversion_station: string | null;
  planned_route: string | null;
  planned_flight_level: number | null;
  planned_block_time_minutes: number | null;
  actual_block_time_minutes: number | null;
  planned_fuel_kg: number | null;
  actual_fuel_kg: number | null;
  passenger_count: number | null;
  cargo_kg: number | null;
  source_system: string;
};

export type FlightListItem = {
  id: string;
  flight_number: string;
  flight_date: string;
  origin_station: string;
  destination_station: string;
  status: string;
  delay_minutes: number;
  scheduled_departure_utc: string;
  scheduled_arrival_utc: string;
  estimated_departure_utc: string | null;
  actual_out_utc: string | null;
  actual_in_utc: string | null;
  tail_number: string | null;
  aircraft_type: string | null;
};

export type StationWx = {
  station_code: string;
  metar: { raw_text: string; flight_category: string | null; observation_time_utc: string; parsed_data: Record<string, unknown> } | null;
  taf: { raw_text: string; valid_until_utc: string | null } | null;
};

export type FlightPerformance = {
  on_time: boolean | null;
  departure_delay_min: number | null;
  arrival_delay_min: number | null;
  block_time_variance_min: number | null;
  fuel_variance_kg: number | null;
  attributed_delay_min: number | null;
  delay_codes: string[] | null;
};

export type DispatchRelease = {
  id: string;
  release_number: string;
  status: string;
  released_at_utc: string;
  valid_until_utc: string | null;
  captain_signature_utc: string | null;
  captain_notes: string | null;
  fuel_plan: Record<string, number> | null;
  weather_summary: Record<string, unknown> | null;
  weight_and_balance: Record<string, number> | null;
  performance_data: Record<string, number> | null;
  planned_route_detail: Record<string, unknown> | null;
};

export type FlightDetail = {
  flight: Flight;
  aircraft: { id: string; tail_number: string; aircraft_type: string } | null;
  dispatch_release: DispatchRelease | null;
  crew: { assignment_id: string; role_on_flight: string; assignment_status: string; crew_member_id: string; first_name: string; last_name: string; crew_role: string }[];
  weather: { origin: StationWx; destination: StationWx; alternates: StationWx[]; enroute_sigmets: { raw_text: string; valid_until: string | null }[] };
  events: { id: string; event_type: string; event_time_utc: string; source_system: string; event_payload: Record<string, unknown> | null }[];
  delays: { id: string; delay_code: string; delay_code_category: string; delay_minutes: number; delay_reason: string | null; responsibility_org: string | null }[];
  briefings: { id: string; briefing_type: string; generated_at_utc: string; content_json: Record<string, unknown> | null }[];
  performance: FlightPerformance;
};

export type DailyOps = {
  total_flights: number;
  on_time_pct: number | null;
  delays_gt15: number;
  cancellations: number;
  diversions: number;
  delays_by_category: Record<string, number>;
  ifr_stations: number;
};

export type DispatchQueueItem = {
  id: string;
  release_number: string;
  status: string;
  released_at_utc: string;
  captain_signature_utc: string | null;
  flight_id: string;
  flight_number: string;
  origin_station: string;
  destination_station: string;
  scheduled_departure_utc: string;
  tail_number: string | null;
};

export type WeatherBoardItem = {
  station_code: string;
  flight_category: string | null;
  raw_text: string;
  observation_time_utc: string;
  parsed_data: Record<string, unknown>;
};

export type WeatherOverlay = {
  stations: WeatherBoardItem[];
  sigmets: { raw_text: string; parsed_data: Record<string, unknown> | null; valid_until_utc: string | null }[];
};

export type FlightEventItem = {
  id: string;
  event_type: string;
  event_time_utc: string;
  flight_id: string;
  source_system: string;
  flight_number: string;
  origin_station: string;
  destination_station: string;
  tail_number: string | null;
};
