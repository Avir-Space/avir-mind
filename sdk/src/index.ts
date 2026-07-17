/**
 * @avir-space/sdk — official TypeScript client for the AVIR Mind public API (v1).
 *
 *   import { AvirClient } from "@avir-space/sdk";
 *   const client = new AvirClient({ apiKey: process.env.AVIR_API_KEY });
 *   const signals = await client.signals.list({ aircraft_id: "…", active: true });
 *   const task = await client.tasks.create({ aircraft_id: "…", title: "…", parent_type: "powerplant", sub_type: "engine_borescope" });
 *
 * Auth via API key (machine) or user token. Auto-retries 429 with backoff.
 */

export interface AvirClientOptions {
  /** API key (avir_live_…) or a user access token. */
  apiKey?: string;
  token?: string;
  /** Override the base URL. Defaults to the AVIR public API. */
  baseUrl?: string;
  /** Supabase anon key required by the gateway (set for self-hosted/edge URLs). */
  gatewayKey?: string;
  /** Max auto-retries on HTTP 429. Default 3. */
  maxRetries?: number;
  fetch?: typeof fetch;
}

export interface Signal {
  id: string; aircraft_id: string | null; category: string; severity: string;
  title: string; narrative: string; confidence: string; is_active: boolean; generated_at_utc: string;
}
export interface Aircraft { id: string; tail_number: string; aircraft_type: string; base_station: string | null; ownership_type: string | null; }
export interface Task { id: string; aircraft_id: string; title: string; status: string; parent_type: string; sub_type: string; dispatch_blocking?: boolean; }
export interface Component { id: string; part_number: string; serial_number: string; component_type: string; status: string; health_score?: number | null; }

export class AvirApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
    this.name = "AvirApiError";
  }
}

export class AvirClient {
  private readonly baseUrl: string;
  private readonly auth: string;
  private readonly gatewayKey?: string;
  private readonly maxRetries: number;
  private readonly _fetch: typeof fetch;

  readonly signals: SignalsResource;
  readonly aircraft: AircraftResource;
  readonly tasks: TasksResource;
  readonly components: ComponentsResource;

  constructor(opts: AvirClientOptions) {
    this.baseUrl = (opts.baseUrl ?? "https://api.avir.space").replace(/\/$/, "");
    this.auth = opts.apiKey ?? opts.token ?? "";
    if (!this.auth) throw new Error("AvirClient: apiKey or token is required.");
    this.gatewayKey = opts.gatewayKey;
    this.maxRetries = opts.maxRetries ?? 3;
    this._fetch = opts.fetch ?? globalThis.fetch;
    this.signals = new SignalsResource(this);
    this.aircraft = new AircraftResource(this);
    this.tasks = new TasksResource(this);
    this.components = new ComponentsResource(this);
  }

  /** @internal */
  async request<T>(method: string, path: string, opts: { query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> {
    const url = new URL(this.baseUrl + "/v1/" + path.replace(/^\//, ""));
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v != null) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Authorization: `Bearer ${this.auth}`, "Content-Type": "application/json" };
    if (this.gatewayKey) headers["apikey"] = this.gatewayKey;

    let attempt = 0;
    for (;;) {
      const res = await this._fetch(url.toString(), { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? 1);
        await new Promise((r) => setTimeout(r, (retryAfter || 2 ** attempt) * 1000));
        attempt++;
        continue;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new AvirApiError(res.status, json.error ?? "error", json.message ?? res.statusText, json.request_id);
      return json.data as T;
    }
  }
}

class SignalsResource {
  constructor(private c: AvirClient) {}
  list(query: { aircraft_id?: string; active?: boolean; limit?: number } = {}) { return this.c.request<Signal[]>("GET", "signals", { query }); }
  get(id: string) { return this.c.request<Signal>("GET", `signals/${id}`); }
  act(id: string, action_type: string) { return this.c.request<{ id: string }>("POST", `signals/${id}/actions`, { body: { action_type } }); }
}
class AircraftResource {
  constructor(private c: AvirClient) {}
  list() { return this.c.request<Aircraft[]>("GET", "aircraft"); }
  get(id: string) { return this.c.request<Aircraft>("GET", `aircraft/${id}`); }
  signals(id: string) { return this.c.request<Signal[]>("GET", `aircraft/${id}/signals`); }
  tasks(id: string) { return this.c.request<Task[]>("GET", `aircraft/${id}/tasks`); }
  components(id: string) { return this.c.request<Component[]>("GET", `aircraft/${id}/components`); }
}
class TasksResource {
  constructor(private c: AvirClient) {}
  list(query: { limit?: number } = {}) { return this.c.request<Task[]>("GET", "tasks", { query }); }
  get(id: string) { return this.c.request<Task>("GET", `tasks/${id}`); }
  create(body: { aircraft_id: string; title: string; parent_type: string; sub_type: string; why_summary?: string }) { return this.c.request<{ id: string }>("POST", "tasks", { body }); }
  acknowledge(id: string) { return this.c.request<{ id: string; acknowledged: boolean }>("POST", `tasks/${id}/acknowledge`); }
}
class ComponentsResource {
  constructor(private c: AvirClient) {}
  list() { return this.c.request<Component[]>("GET", "components"); }
  get(id: string) { return this.c.request<Component>("GET", `components/${id}`); }
}
