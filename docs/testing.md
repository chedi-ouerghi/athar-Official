# Testing

## Running

```bash
pnpm test                              # everything
pnpm --filter @athar/api test          # API only
pnpm --filter @athar/mobile test       # mobile only
pnpm --filter @athar/api test:watch    # watch mode
```

Current state: **59 tests, all passing** — 29 in the API, 30 on mobile.

| Layer            | Runner             | Location                       |
| ---------------- | ------------------ | ------------------------------ |
| Unit             | Vitest             | `apps/api/src/**/*.spec.ts`    |
| HTTP integration | Vitest + Supertest | `apps/api/test/**/*.spec.ts`   |
| Unit (mobile)    | Vitest             | `apps/mobile/src/**/*.spec.ts` |

## What is covered

### API

**Environment validation** (`src/config/environment.schema.spec.ts`) — safe
defaults, coercion of numeric strings, rejection of an unknown `NODE_ENV`, an
out-of-range port and a negative timeout, and the requirement that _all_ problems
are reported at once rather than only the first.

**Request validation** (`src/common/validation/zod-validation.pipe.spec.ts`) —
pass-through of valid input, the parsed value being returned rather than the raw
one, per-field details prefixed with the request source, dotted paths for nested
fields, and stripping of undeclared keys.

**Health service** (`src/health/health.service.spec.ts`) — liveness payload,
probe names and outcomes, and a degraded readiness result when configuration is
unusable.

**Shutdown** (`src/lifecycle/shutdown-coordinator.service.spec.ts`) — signal
handlers are registered on init, removed on destroy (no listener leak), the
watchdog forces an exit when the graceful path overruns, and it does _not_ fire
when shutdown completes in time.

**HTTP integration** (`test/api.e2e.spec.ts`) — exercises the fully wired
application: `/health` and `/ready` respond and match the shared contracts, the
probes are not mounted under the versioned prefix, unknown routes inside and
outside `/api` both return the error envelope, a caller-supplied `x-request-id`
is echoed, malformed JSON returns `400`, and the health payload exposes exactly
five fields with no configuration or infrastructure detail.

### Mobile

**Configuration resolution** (`src/config/env.spec.ts`) — the loopback mapping
(Android → `10.0.2.2`, iOS/web → `localhost`), configured URLs taking
precedence, trailing slashes stripped, blank treated as unset, invalid URLs and
out-of-range ports rejected, and the error naming the offending variable.

**HTTP transport** (`src/api/http-client.spec.ts`) — URL construction from
configuration, query serialisation, the timeout, network failure, caller
cancellation, reuse of the server's error envelope, a non-JSON error body, and a
response that breaks the contract.

**API client** (`src/api/athar-api-client.spec.ts`) — probe paths, and
`probeBackend()` returning a result rather than throwing when the backend is
offline.

## Notes on the toolchain

**The API test runner uses SWC, not esbuild.** NestJS resolves dependencies
through `emitDecoratorMetadata`, which esbuild (Vitest's default) does not
implement. Without SWC, `Test.createTestingModule()` would fail to inject
anything. See `apps/api/vitest.config.ts`.

**Tests use forked workers.** Each spec builds its own Nest application; separate
processes keep signal listeners and HTTP servers isolated.

**Integration tests build the real application.** They call
`createConfiguredApp(createTestConfig())` with an explicit configuration, so
they never depend on a developer's `.env`, shell environment or listening port.

## Deliberately not covered

**Screen rendering.** The startup screen is a thin composition over tested
infrastructure: the configuration it renders comes from `env.ts` and the status
it displays comes from `probeBackend()`, both of which are unit-tested.
Adding a React Native renderer (`jest-expo`, `@testing-library/react-native`) now
would buy coverage of markup that is about to change with the first product
screen, at the cost of a second test runner in the workspace.

Add it when the first screen with real behaviour exists. At that point:

```bash
pnpm --filter @athar/mobile add -D jest-expo @testing-library/react-native
```

and move `apps/mobile` to a single runner for both unit and component tests.
Keep the pure-logic specs runnable without a renderer regardless.

**Load, performance and device testing.** Out of scope for an infrastructure
foundation.

## Verified manually

Static checks do not prove an app runs. These were verified by hand against a
real Android emulator (`Medium_Phone_API_36.1`) and a real API process:

1. The API starts and binds `0.0.0.0:3000`.
2. `GET /health` and `GET /ready` return `200` with contract-shaped payloads.
3. Unknown routes return the error envelope, inside and outside `/api`.
4. `x-request-id` is echoed into the response.
5. The app renders in Expo Go, resolves `http://10.0.2.2:3000` from the platform
   default, and reports the backend as **Reachable**.
6. With the API stopped, the app still renders and reports **Unreachable** —
   no crash, no blocking error.

Repeat them with `pnpm dev` and `pnpm --filter @athar/mobile android`.
