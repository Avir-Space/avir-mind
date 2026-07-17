# @avir-space/sdk

Official TypeScript SDK for the **AVIR Mind** public API (v1).

```bash
npm install @avir-space/sdk
```

```typescript
import { AvirClient } from "@avir-space/sdk";

const client = new AvirClient({ apiKey: process.env.AVIR_API_KEY });

// Read
const signals = await client.signals.list({ aircraft_id: "xxx", active: true });
const aircraft = await client.aircraft.list();

// Write
const task = await client.tasks.create({
  aircraft_id: "xxx",
  title: "Borescope #1 engine",
  parent_type: "powerplant",
  sub_type: "engine_borescope",
});

// Action
await client.tasks.acknowledge(task.id);
await client.signals.act(signals[0].id, "acknowledged");
```

- **Auth** — pass `apiKey` (machine, `avir_live_…`) or `token` (user access token).
- **Auto-retry** — HTTP 429 is retried with `Retry-After` backoff (up to `maxRetries`, default 3).
- **Typed** — every resource returns typed results matching the API schema.
- **Errors** — non-2xx throws `AvirApiError { status, code, message, requestId }`.

## Base URL

Defaults to `https://api.avir.space`. To target the Supabase edge deployment directly,
set `baseUrl` to the function URL and pass the project's `gatewayKey` (anon key):

```typescript
new AvirClient({
  apiKey: process.env.AVIR_API_KEY,
  baseUrl: "https://<ref>.supabase.co/functions/v1/api-v1",
  gatewayKey: process.env.SUPABASE_ANON_KEY,
});
```

## Scopes

Keys are scoped (`read:signals`, `write:tasks`, …). A call missing the required scope
returns `403 insufficient_scope`. Rate limits are per-key, per-minute (`429` + `Retry-After`).

## Publishing (maintainers)

```bash
cd sdk && npm run build && npm publish
```

Version `0.1.0`. Publishing requires an `@avir-space` npm org token.
