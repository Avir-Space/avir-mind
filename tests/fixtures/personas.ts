/** Typed constants for the 10 E2E personas (seeded by 20260801000001_test_personas.sql). */

export type PersonaKey =
  | "owner" | "dom" | "dispatcher" | "line_maint" | "dispatch_supervisor" | "read_only"
  | "mro_owner" | "mro_customer_manager" | "mro_technician" | "mro_quality";

export type Tenant = "operator" | "mro";

export type Persona = {
  key: PersonaKey;
  email: string;
  password: string;
  /** AVIR org_members role (spec "member" maps to editor — see README deviations). */
  role: "owner" | "admin" | "editor" | "viewer";
  jobTitle: string | null;
  tenant: Tenant;
};

export const TEST_PASSWORD = "TestPersona!2026";

export const PERSONAS: Record<PersonaKey, Persona> = {
  owner: { key: "owner", email: "owner@avir-test.dev", password: TEST_PASSWORD, role: "owner", jobTitle: null, tenant: "operator" },
  dom: { key: "dom", email: "dom@avir-test.dev", password: TEST_PASSWORD, role: "admin", jobTitle: "Director of Maintenance", tenant: "operator" },
  dispatcher: { key: "dispatcher", email: "dispatcher@avir-test.dev", password: TEST_PASSWORD, role: "editor", jobTitle: "Dispatcher", tenant: "operator" },
  line_maint: { key: "line_maint", email: "line_maint@avir-test.dev", password: TEST_PASSWORD, role: "editor", jobTitle: "Line Maintenance Controller", tenant: "operator" },
  dispatch_supervisor: { key: "dispatch_supervisor", email: "dispatch_supervisor@avir-test.dev", password: TEST_PASSWORD, role: "admin", jobTitle: "Dispatch Supervisor", tenant: "operator" },
  read_only: { key: "read_only", email: "read_only@avir-test.dev", password: TEST_PASSWORD, role: "viewer", jobTitle: null, tenant: "operator" },
  mro_owner: { key: "mro_owner", email: "mro_owner@avir-test.dev", password: TEST_PASSWORD, role: "owner", jobTitle: null, tenant: "mro" },
  mro_customer_manager: { key: "mro_customer_manager", email: "mro_customer_manager@avir-test.dev", password: TEST_PASSWORD, role: "editor", jobTitle: "Customer Manager", tenant: "mro" },
  mro_technician: { key: "mro_technician", email: "mro_technician@avir-test.dev", password: TEST_PASSWORD, role: "editor", jobTitle: "Shop Floor Technician", tenant: "mro" },
  mro_quality: { key: "mro_quality", email: "mro_quality@avir-test.dev", password: TEST_PASSWORD, role: "editor", jobTitle: "Quality Inspector", tenant: "mro" },
};

export const ALL_PERSONA_KEYS = Object.keys(PERSONAS) as PersonaKey[];

export function getPersona(key: PersonaKey): Persona {
  const p = PERSONAS[key];
  if (!p) throw new Error(`Unknown persona: ${key}`);
  return p;
}
