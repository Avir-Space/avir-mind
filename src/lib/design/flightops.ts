export const FLIGHT_STATUS: Record<string, { label: string; hex: string }> = {
  planned: { label: "Planned", hex: "#94A3B8" },
  scheduled: { label: "Scheduled", hex: "#6B7280" },
  dispatched: { label: "Dispatched", hex: "#2563EB" },
  boarding: { label: "Boarding", hex: "#0891B2" },
  taxiing: { label: "Taxiing", hex: "#0D9488" },
  airborne: { label: "Airborne", hex: "#1019EC" },
  arrived: { label: "Arrived", hex: "#16A34A" },
  delayed: { label: "Delayed", hex: "#EA580C" },
  cancelled: { label: "Cancelled", hex: "#DC2626" },
  diverted: { label: "Diverted", hex: "#DC2626" },
  returned: { label: "Returned", hex: "#CA8A04" },
};
export const flightStatus = (s: string) => FLIGHT_STATUS[s] ?? { label: s, hex: "#6B7280" };

export const FLIGHT_CATEGORY: Record<string, { label: string; hex: string }> = {
  vfr: { label: "VFR", hex: "#16A34A" },
  mvfr: { label: "MVFR", hex: "#2563EB" },
  ifr: { label: "IFR", hex: "#CA8A04" },
  lifr: { label: "LIFR", hex: "#DC2626" },
};
export const flightCategory = (c: string | null | undefined) => FLIGHT_CATEGORY[c ?? ""] ?? { label: c ?? "—", hex: "#6B7280" };

export const DISPATCH_STATUS: Record<string, { label: string; hex: string }> = {
  draft: { label: "Draft", hex: "#6B7280" },
  pending_captain: { label: "Pending Captain", hex: "#CA8A04" },
  captain_accepted: { label: "Accepted", hex: "#16A34A" },
  revoked: { label: "Revoked", hex: "#DC2626" },
  superseded: { label: "Superseded", hex: "#94A3B8" },
};
export const dispatchStatus = (s: string) => DISPATCH_STATUS[s] ?? { label: s, hex: "#6B7280" };

/** IATA delay code category → label. */
export const DELAY_CATEGORY: Record<string, string> = {
  passenger: "Passenger", cargo: "Cargo", ramp: "Ramp", technical: "Technical", damage: "Damage",
  aircraft: "Aircraft", flight_operations: "Flight Ops", weather: "Weather", atc: "ATC",
  government: "Government", reactionary: "Reactionary",
};

export const FLIGHT_EVENT_LABEL: Record<string, string> = {
  release_issued: "Release issued", boarding_started: "Boarding started", boarding_completed: "Boarding complete",
  doors_closed: "Doors closed", pushback: "Pushback", taxi_out: "Taxi out", takeoff: "Takeoff",
  top_of_climb: "Top of climb", cruise_deviation: "Cruise deviation", top_of_descent: "Top of descent",
  landing: "Landing", taxi_in: "Taxi in", doors_open: "Doors open", deplaning_completed: "Deplaning complete",
  delay_recorded: "Delay recorded", delay_code_applied: "Delay code applied", alternate_declared: "Alternate declared",
  emergency_declared: "Emergency declared", diversion_executed: "Diversion", cancellation: "Cancellation",
  crew_change: "Crew change", aircraft_swap: "Aircraft swap", fuel_uplift: "Fuel uplift", incident_report: "Incident",
};
export const flightEventLabel = (e: string) => FLIGHT_EVENT_LABEL[e] ?? e.replace(/_/g, " ");

export const OPS_SIGNAL_CATEGORIES = new Set([
  "weather_impact", "delay_pattern", "fuel_variance", "diversion_risk", "crew_impact_from_delay", "turnaround_risk",
]);
