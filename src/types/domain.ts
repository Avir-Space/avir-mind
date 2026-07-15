import type { Database } from "./database";

// Convenience row aliases pulled from the generated schema types.
type Tables = Database["public"]["Tables"];
export type Org = Tables["orgs"]["Row"];
export type OrgMember = Tables["org_members"]["Row"];
export type Fleet = Tables["fleets"]["Row"];
export type Aircraft = Tables["aircraft"]["Row"];
export type AircraftState = Tables["aircraft_state"]["Row"];

// Domain unions mirroring the DB CHECK constraints (stored as text).
export type AircraftStateValue =
  | "under_maintenance"
  | "in_air"
  | "on_ground"
  | "stationed"
  | "unknown";
export type StateSource = "telemetry" | "ops_system" | "manual";
export type StateConfidence = "high" | "medium" | "low";
export type OwnershipType = "owned" | "leased" | "managed";
export type OrgRole = "owner" | "admin" | "editor" | "viewer";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Aircraft joined with its live state — the shape used by list + profile views. */
export type AircraftWithState = Aircraft & {
  aircraft_state: AircraftState | null;
};
