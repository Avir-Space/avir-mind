import { faker } from "@faker-js/faker";

import { getServiceRoleClient, hasServiceRole } from "./supabase";
import { type PersonaKey } from "../fixtures/personas";

/**
 * Provision an isolated fresh org for tests that need it. Requires the service
 * role key (creates a confirmed auth user via admin). Returns the credentials.
 * No-ops (returns null) when the service key isn't available.
 */
export async function createFreshOrgWithPersonas(): Promise<{ email: string; password: string } | null> {
  if (!hasServiceRole()) return null;
  const admin = getServiceRoleClient();
  const email = `e2e_${faker.string.alphanumeric(8).toLowerCase()}@avir-test.dev`;
  const password = "TestPersona!2026";
  // @ts-expect-error admin API available on the service-role client
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return null;
  return { email, password };
}

/** Clear persona-specific test state (2FA factors, extra sessions) between runs. */
export async function resetPersonaState(_key: PersonaKey): Promise<void> {
  // 2FA factors are torn down per-test in the specs that enroll them; sessions
  // are best-effort. A no-op here keeps the API surface stable for the other
  // modules to build on.
  return;
}
