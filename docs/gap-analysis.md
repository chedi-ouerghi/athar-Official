# Gap analysis

> **Superseded (2026-10-15).** The work list now lives in `docs/plans/athar-v1-plan.md`; §4 below no longer matches the code.
>
> **Current plan (2026-10-22).** This is a historical audit of 2026-10-11 and is kept as such. Since then the
> product code, accounts, MQTT driver, admin page and Docker stacks exist. Tests now run **on site on a
> Raspberry Pi** ([hardware/GUIDE-EQUIPE-DUBAI.md](../hardware/GUIDE-EQUIPE-DUBAI.md)), the cloud VM is paused,
> and the Raspberry Pi agent (`apps/table-agent`) is still to be written.

Audit of the repository as of 2026-10-11 (branch `master`, no commits yet, all files untracked).
No source code was changed. Every command result below was produced by running it on
Windows 11, Node v20.19.2, pnpm 10.12.2. Claims that come from reading code rather than running
it are marked **(by inspection)**.

> **Status update (2026-10-11, after the audit).** Fixed since: 3.1 (dev scripts), 3.2
> (`EXPO_PUBLIC_*` inlining), 3.3 (application logs through pino), 3.5 (contracts read from
> source), the error-filter part of 3.6 (domain exceptions carry their own code), the e2e test
> naming and duplicate `app.init()`, the `packages/contracts` lint and test scripts, and the
> mobile Vitest ESM warning. Still open: CI, screen-level tests, and the remaining small
> items in 3.6. The sections below are left as audited, as a record of what was found.

Target journey for this analysis:

> scan a table QR code → open that table's screen → browse 4 designs → pick one → start a
> drawing → watch progress on a SIMULATED table → see completion or an error → start again

## 1. Verification results

| Command                                                                                      | Result                 | Notes                                                                                           |
| -------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm install`                                                                               | pass                   | Lockfile up to date; `@athar/contracts` `prepare` built it. pnpm 12.11.2 is available.          |
| `pnpm format:check`                                                                          | pass                   | "All matched files use Prettier code style!"                                                    |
| `pnpm lint`                                                                                  | pass                   | Runs `eslint .` in `apps/api` and `apps/mobile` only (see 3.4).                                 |
| `npx eslint packages/contracts packages/config eslint.config.js apps/mobile/metro.config.js` | pass                   | Run by hand: `pnpm lint` does not cover these paths.                                            |
| `pnpm typecheck`                                                                             | pass                   | contracts, api, mobile.                                                                         |
| `pnpm test`                                                                                  | pass                   | API 29 tests / 5 files, mobile 30 tests / 3 files. Matches `docs/testing.md`.                   |
| `pnpm build`                                                                                 | pass                   | contracts `tsc`, api `tsc`, mobile `expo export --platform android` (1352 modules, 3.4 MB hbc). |
| `pnpm check`                                                                                 | not run as one command | It is exactly the first four rows above, each of which passed.                                  |
| `pnpm dev:api`                                                                               | **FAIL**               | `ERR_PNPM_NO_SCRIPT Missing script: dev:serve` (see 3.1).                                       |
| `pnpm dev`                                                                                   | **FAIL** by inspection | Runs the same broken API `dev`; mobile has no `dev` script (see 3.1).                           |
| `node dist/main.js` (`NODE_ENV=production PORT=3055`)                                        | pass                   | `/health` 200, `/ready` 200, `/api/v1/tables/t1` 404 with the standard error envelope.          |
| `PORT=abc node dist/main.js`                                                                 | pass                   | Exits with `PORT: Invalid input: expected number, received NaN`.                                |
| Mobile bundle env-inlining experiment                                                        | **FAIL**               | See 3.2.                                                                                        |

Scripts that do not exist: `packages/contracts` has no `lint` or `test`; `packages/config` has no
scripts at all; the root has no `lint`/`test` of its own (it delegates with `pnpm -r`). Nothing was
run on a device or emulator, and no Expo dev server was started.

## 2. What exists and works

Infrastructure only. There is **no product code**: `README.md:6` says so explicitly, and the code
agrees.

**API (`apps/api`, NestJS 12, ESM)**

- Composition root and testable bootstrap: `src/app.module.ts` (`AppModule.forRoot(config)`),
  `src/bootstrap.ts` (`createConfiguredApp` for tests, `createApp` for production), `src/main.ts`.
- Env validation with Zod, fail-fast, all problems reported at once:
  `src/config/environment.schema.ts`, `load-app-config.ts`, `app-config.ts`, `app-config.module.ts`
  (global `APP_CONFIG` token).
- Versioning: global prefix `api`, URI versioning, `defaultVersion: '1'` (`src/bootstrap.ts:100-104`).
  Probes `/health` and `/ready` are excluded from the prefix (`src/health/*`).
- Error envelope for every failure, including unknown routes, malformed JSON and unexpected
  exceptions: `src/common/http/api-exception.filter.ts`, registered via `APP_FILTER`.
- Zod request validation: `src/common/validation/zod-validation.pipe.ts`,
  `validation-failed.exception.ts`, `zod-issues.ts`.
- Correlation ids (`x-request-id`), pino-http request logging with redaction:
  `src/logging/create-logger.module.ts`.
- Graceful shutdown watchdog: `src/lifecycle/shutdown-coordinator.service.ts`.
- Tests: 29 passing (`src/**/*.spec.ts`, `test/api.e2e.spec.ts`) using the real app through
  Supertest.

**Contracts (`packages/contracts`)**

- Zod schemas + inferred types for health, readiness, error envelope and API prefix/version
  constants (`src/health.ts`, `src/errors.ts`, `src/api.ts`, `src/index.ts`). Built to `dist/`
  and consumed by both apps.

**Mobile (`apps/mobile`, Expo 57, RN 0.86, Expo Router)**

- Expo Router root layout and one route: `src/app/_layout.tsx`, `src/app/index.tsx` (a
  connectivity/diagnostics screen, not a product screen).
- Validated env resolution with per-platform loopback (`10.0.2.2` on Android):
  `src/config/env.ts`, `src/config/environment.ts` (but see 3.2).
- Transport with timeout, cancellation, error classification and response validation:
  `src/api/http-client.ts`; typed client `src/api/athar-api-client.ts` (`getHealth`,
  `getReadiness`, `probeBackend`).
- Light/dark tokens: `src/theme.ts`. App config with `scheme: 'athar'`, `typedRoutes: true`:
  `app.config.ts`. EAS profiles: `eas.json`. Metro pnpm workspace config: `metro.config.js`.
- Tests: 30 passing, all pure logic (no renderer).

**Tooling**

- pnpm workspace, shared strict `tsconfig.base.json`, single root `eslint.config.js` (flat, type-aware
  for TS), shared Prettier config in `packages/config`, `.editorconfig`.

## 3. What exists but is broken or incomplete

### 3.1 Dev scripts are broken (blocks local development)

- `apps/api/package.json:9` — `dev` runs `pnpm run dev:serve`, but no `dev:serve` script exists
  (the scripts are `dev:build` and `start:dev`). Reproduced:
  `pnpm dev:api` → `ERR_PNPM_NO_SCRIPT Missing script: dev:serve`, process exits 1.
  Fix is presumably to rename `start:dev` to `dev:serve`, or call it. Note `node --watch dist/main.js`
  will also start before the first `tsc` build has written `dist/` on a clean checkout.
- `package.json:11` (root) — `pnpm dev` is `pnpm --parallel --stream --filter "./apps/*" dev`, but
  `apps/mobile` has no `dev` script (it has `start`, `android`, `ios`). pnpm skips packages without the
  script, so `pnpm dev` would start only the (broken) API. `README.md:27` and
  `docs/development-setup.md:49-53` claim it runs both. **(by inspection; the mobile half confirmed with
  `pnpm --filter @athar/mobile run dev` → "None of the selected packages has a "dev" script")**

### 3.2 Mobile `EXPO_PUBLIC_*` configuration is not inlined (configured API URL is ignored)

- `apps/mobile/src/config/env.ts:98-106` — `readRawEnvironment(source = process.env)` reads values off
  a `process.env` object. Expo's Babel preset only inlines literal `process.env.EXPO_PUBLIC_X`
  member expressions.
- Experiment: `EXPO_PUBLIC_API_BASE_URL=http://marker-host.invalid:4321 EXPO_PUBLIC_API_TIMEOUT_MS=7777
expo export --platform android --no-bytecode`. The marker host appears **0** times in the JS bundle,
  and the exported code is `readRawEnvironment=function(i=process.env){return{EXPO_PUBLIC_API_BASE_URL:i.EXPO_PUBLIC_API_BASE_URL,...}}`
  (the one `7777` hit is an icon-font codepoint; an unset-env control build has it too).
- Consequence: in an exported bundle the app will always use the platform default
  (`10.0.2.2` / `localhost`), so a physical device can never be pointed at a LAN IP, and `eas.json`'s
  `env` block has no effect. `docs/environment-configuration.md` and `docs/development-setup.md`
  document exactly that workflow.
- Not tested: whether `expo start` (dev server) behaves differently. `docs/testing.md:101-115` records
  manual verification only of the platform-default path, which is why this went unnoticed. The unit
  tests inject a fake source, so they cannot catch it.

### 3.3 Application logs bypass pino (docs claim otherwise)

- `src/bootstrap.ts:91` creates the app with `NestFactory.create(...)` without `bufferLogs` and there
  is no `app.useLogger(...)` call anywhere. Code logs through Nest's static `Logger`
  (`new Logger(...)` in `api-exception.filter.ts:208`, `shutdown-coordinator.service.ts:24`,
  `main.ts:23`, `bootstrap.ts:128`).
- Observed with `NODE_ENV=production`: those lines are Nest's default coloured plain text
  (`[Nest] 16768 - ... LOG [NestFactory] ...`); only the pino-http request line is JSON. Therefore
  `LOG_LEVEL`, redaction, `service`/`serviceVersion` fields and JSON output do not apply to
  application logs, including the error filter's output and its request ids.
  `docs/api-conventions.md:119-127` and `docs/architecture.md:98` state the opposite.
- Also visible in tests: `LOG_LEVEL=silent` does not silence Nest's own logs.

### 3.4 Quality gates have coverage holes

- `pnpm lint` is `pnpm -r lint`, so it lints only `apps/api` and `apps/mobile`. `packages/contracts`,
  `packages/config` and root JS files are linted only if someone runs ESLint from the root (I did;
  clean). Add a `lint` script to `contracts` or lint from the root.
- No `test` script in `packages/contracts`, and no tests for its schemas.
- No CI of any kind (`docs/future-infrastructure-decisions.md:93-97`); `pnpm check` is manual.
- The mobile app has no component/screen tests by design (`docs/testing.md:82-99`); `index.tsx` is
  entirely untested.
- `apps/mobile` test run prints a Vite warning: ESM syntax in `vitest.config.ts` loaded as CommonJS
  (`apps/mobile/vitest.config.ts:1`). Non-fatal today; Vite says it will become an error.

### 3.5 Contracts are consumed from build output

- `@athar/contracts` resolves to `dist/` (`packages/contracts/package.json` `main`/`exports`), built
  only by `prepare` on install. After editing `packages/contracts/src`, API tests, API dev and Metro all
  see the **old** `dist` until `pnpm --filter @athar/contracts build` is run. The root `dev` does not run
  the contracts watcher (`packages/contracts` has a `dev` script, but `--filter "./apps/*"` excludes it).
  This will bite constantly once contracts start changing every few minutes.

### 3.6 Smaller defects and doc drift

- `apps/api/src/common/http/api-exception.filter.ts:56-60` — only 400, 404 and 503 map to specific
  codes. Any other 4xx (401, 403, 409, 422, 429) is reported as `BAD_REQUEST`, and a thrown
  `HttpException` of 5xx other than 503 becomes `INTERNAL_SERVER_ERROR`. The envelope cannot express
  "table busy" or "drawing already running".
- `packages/contracts/src/errors.ts:16-22` — the error-code enum is closed (5 codes) and documented as
  part of the public contract (`docs/api-conventions.md:85-87`); every new domain code is a contract
  change.
- `apps/api/test/api.e2e.spec.ts:107,114` — test is titled "rejects a malformed JSON body with
  VALIDATION_FAILED" but asserts `BAD_REQUEST`. `:24` calls `app.init()` a second time (already done in
  `createConfiguredApp`).
- `apps/api/src/lifecycle/shutdown-coordinator.service.spec.ts` — `process.emit('SIGTERM')` produces the
  log line `Received undefined.`; cosmetic.
- `apps/mobile/tsconfig.json:10` and `vitest.config.ts:15-17` define an `@/*` alias, but no source file
  uses it (all imports are relative). Convention is ambiguous.
- `apps/mobile/src/api/http-client.ts` — only `get()` exists (no POST/PUT/DELETE), and requests do not
  send `x-request-id`.
- `pnpm-workspace.yaml:10` — comment says `nx, @parcel/watcher` are "listed defensively below"; they
  are not listed.
- `docs/future-infrastructure-decisions.md:101` — stray `*` after "Deliberately omitted."
- `docs/architecture.md:29` lists `src/bootstrap` as a directory; it is `src/bootstrap.ts`.
- `docs/testing.md:12` hard-codes "59 tests"; correct today, will go stale.
- No commits exist, and the working branch is `master` while the declared main branch is `main`.

## 4. What is missing for the end-to-end journey

Nothing on the journey exists. The list below is ordered along the journey, with the closest
existing building block noted.

### 4.1 Contracts (`packages/contracts`)

None of the domain exists. Needed (Zod schemas + types, per the existing pattern):

- `Table` (id, name, status/availability), `Design` (id, name, preview reference, optional estimated
  duration), `Drawing`/`Job` (id, tableId, designId, `status`, `progress`, timestamps, error info).
- Job status vocabulary, e.g. `queued | running | completed | failed` (+ `cancelled` if wanted).
- Request/response schemas for: get table, list designs, start drawing, get drawing.
- Decision on QR payload format (see section 6) as a shared schema, because the scanner and any
  generated QR codes must agree.
- New error codes (e.g. `TABLE_NOT_FOUND`, `DESIGN_NOT_FOUND`, `TABLE_BUSY`, `SIMULATED_FAULT`).
  Requires a version-1-compatible additive change to `apiErrorCodeSchema` and a wider
  `STATUS_TO_CODE` mapping in the filter (3.6).

### 4.2 API (`apps/api`)

- No `tables`, `designs` or `drawings` modules, controllers, or services. Only `HealthModule` exists.
  Every route would be new under `/api/v1/...`.
- No data store. The docs' stance is "no database until justified"; for a simulation an in-memory
  repository behind an interface is enough, but it must be designed deliberately because state (a
  running job) must survive between polls and is lost on restart.
- **Simulated table**: no simulator exists. Needs a clock-driven state machine per table
  (idle → running → completed | failed), deterministic under test (injectable clock / tick source),
  with a way to force the error path, and a rule for concurrent starts (one drawing per table).
- **Progress delivery**: nothing for live updates. Simplest fit with current conventions is polling a
  `GET` endpoint; SSE/WebSocket would contradict `docs/future-infrastructure-decisions.md:65-70`
  (gateway as a separate process) unless that decision is revisited.
- A seed of exactly 4 designs per table (or global), served by the API.

### 4.3 Mobile (`apps/mobile`)

- **QR scanning**: no camera/scanner dependency (`expo-camera` is not in `package.json`), no camera
  permission configuration (`app.config.ts:39` has only the `expo-router` plugin), no scanner screen.
  Expo Go supports `expo-camera`, so no dev build is needed for this.
- **Routes**: `_layout.tsx:16-18` declares only `index`. Needed at minimum: a scan screen, a table
  screen (`table/[tableId]`), a design detail or selection step, and a drawing/progress screen
  (`drawing/[drawingId]`), plus completion/error states. The `athar://` scheme is already set
  (`app.config.ts:21`), so a QR encoding `athar://table/<id>` would deep-link into Expo Router for free
  once such a route exists.
- **API client**: `AtharApiClient` has only probes. Needs table, designs, start-drawing and
  get-drawing methods, plus POST support in `HttpClient`.
- **Async state**: no data-fetching/polling layer, no cache, no navigation-aware cancellation (the
  startup screen hand-rolls this with `AbortController`; repeating that per screen will not scale).
- **UI**: no design list/grid, no progress component, no error/empty/retry components. Theme tokens
  exist (`src/theme.ts`) but there is no shared component library.
- **Tests**: no renderer is installed, so none of the above screens can be component-tested yet.

### 4.4 Cross-cutting

- No auth/identity. Anyone who can reach the API can start a drawing on any table id. Acceptable for a
  simulation, but it is a deliberate gap.
- No QR codes exist to scan: need a way to generate or print a test code for a simulated table.
- No end-to-end test of the journey, and no way to run API + mobile together right now (3.1).
- No docs for the domain model, the simulator, or the QR format.

## 5. Conventions already in place (new code must follow)

**API versioning and routing** — business controllers are auto-versioned `v1` under `/api`; do not add
`@Controller` versions or prefixes by hand (`bootstrap.ts:100-104`). `/health` and `/ready` are the only
unprefixed routes (`VERSION_NEUTRAL`, `health.controller.ts:19`). Additive changes keep `v1`
(`docs/api-conventions.md:135-140`). Plain-object success responses, no envelope.

**Error format** — one shape, `{ error: { code, message, details?, requestId, timestamp } }` defined by
`apiErrorResponseSchema`. Throw Nest `HttpException`s (or `ValidationFailedException`) and let
`ApiExceptionFilter` format them; never `res.status().json()` an error from a controller. Internal
errors are never leaked. The mobile client already parses this into `ApiError` with
`kind: timeout | cancelled | network | http | invalid-response`.

**Zod validation** — validate at the boundary with `new ZodValidationPipe(schema, 'body' | 'query' |
'params')`; it is intentionally not global, so every endpoint must opt in. Handlers receive the parsed
value; unknown keys are stripped. Schemas for wire payloads belong in `@athar/contracts` and are shared
by both apps; mobile validates every response (`HttpClient.get(path, schema)`).

**Config loading** — nothing outside `src/config` reads `process.env`; services inject `AppConfig` via
`@Inject(APP_CONFIG)`. New env vars go in `environment.schema.ts`, `AppConfig`/`createAppConfig`,
`.env.example` and `docs/environment-configuration.md`; precedence is real env > `.env.local` > `.env`.
Tests build config through `test/create-test-config.ts`. Mobile: only `EXPO_PUBLIC_*`, read in
`config/env.ts` (but see 3.2 before relying on it).

**Logging** — use Nest's `Logger` (never `console`; `no-console` is an error). Be aware of 3.3: it does
not currently route through pino.

**Testing** — Vitest on both sides; API specs are `src/**/*.spec.ts` (unit) and `test/**/*.spec.ts`
(HTTP, via `createConfiguredApp(createTestConfig())` + Supertest); the API uses SWC for decorator
metadata (`vitest.config.ts`) and forked workers; mobile specs are `src/**/*.spec.ts` in a Node
environment and must not import `react-native` (hence the `env.ts` / `environment.ts` split). Inject
`fetchImpl` rather than mocking globals. Run all gates with `pnpm check`.

**Expo Router layout** — routes live in `apps/mobile/src/app/` (Expo Router is rooted at `src/app`);
`_layout.tsx` is the single place to mount providers; `typedRoutes: true`; `headerShown: false` on the
root `Stack`. Screens must not build URLs; they go through `AtharApiClient`, which owns route strings.

**Code style** — ESM everywhere in the API/contracts (relative imports carry `.js` extensions; mobile
imports do not); strict TS with `noUncheckedIndexedAccess`; `consistent-type-imports` with inline
`type`; `eqeqeq`; no `any`; unused bindings prefixed `_`; Prettier 100 cols, single quotes, trailing
commas; doc comments explain _why_. Contracts must stay framework-free.

## 6. Risks and open questions

**Risks**

1. **Dev workflow is broken** (3.1) and the **configured API URL does nothing** (3.2). Both will
   dominate the first day of feature work if left alone, and the second only shows on physical devices.
2. **Contracts via `dist/`** (3.5) will cause confusing stale-type/stale-schema behaviour as soon as
   contracts churn.
3. **Very new dependency majors** (NestJS 12, Expo 57, RN 0.86, React 19.2, TypeScript 6, Zod 4,
   Vitest 5, ESLint pinned to 9 for Expo's plugins). Everything installs and passes today, but expect thin
   community answers and plugin-compatibility surprises; pin and upgrade deliberately. Note
   `docs/future-infrastructure-decisions.md:134` already records one Nest CLI/Node 20 crash.
4. **In-memory simulator state** is lost on API restart (and `node --watch` restarts on every rebuild),
   so a "running" drawing disappears mid-demo. The mobile side must treat 404 on an existing drawing id as
   a first-class state.
5. **Polling cost and drift** if progress is derived by ticks rather than from timestamps. Prefer
   computing progress from `startedAt` + duration so the value is a pure function of time (testable, no
   timers to leak across tests or processes).
6. **Version control**: no commit exists, everything is untracked, and `master`/`main` disagree. No
   rollback point and no CI.
7. **Security posture for a real table later**: no auth, `HOST=0.0.0.0` by default, no rate limiting.
   Fine for a local simulation; must not ship as is.
8. Android cleartext HTTP in non-Expo-Go builds needs `expo-build-properties`
   (`docs/development-setup.md:131-133`); not configured yet.

**Open questions for the product owner**

1. **QR payload**: bare table id, a `athar://table/<id>` deep link, or an HTTPS URL? Is the id secret or
   guessable (e.g. `T-0001`)? Does a QR code ever need to expire or be pairing-specific?
2. **Designs**: the same 4 for every table, or per-table? Where do previews come from (bundled assets
   vs. served by the API), and is "4" a fixed rule or a seed-data accident?
3. **Simulator behaviour**: duration of a drawing, whether progress is linear, how the error path is
   triggered (random, per-design, or an explicit dev control), and what "start again" means after
   failure vs. after success (same design prefilled? back to the design list?).
4. **Concurrency**: what happens when a second phone scans a table that is already drawing — read-only
   progress view, "busy" error, or take-over?
5. **Cancellation**: is stopping a drawing in scope for this journey?
6. **Progress transport**: is polling every ~1 s acceptable for the simulation, or is live push a
   requirement (which would reopen the gateway decision)?
7. **Persistence of history**: is a list of past drawings needed, or only the current one?
8. **Branch and repository**: should work move to `main`, and when should the first commit/CI land?
