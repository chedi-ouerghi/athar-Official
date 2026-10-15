# Testing

## Running

```bash
pnpm test                              # everything
pnpm --filter @athar/api test          # API only
pnpm --filter @athar/mobile test       # mobile only
pnpm --filter @athar/contracts test    # contracts only
pnpm --filter @athar/api test:watch    # watch mode
```

`pnpm test` runs every package and fails if any test fails; the summary at the
end of its output is the authoritative count. This document deliberately does
not repeat that number, because it goes stale with every spec.

| Layer            | Runner             | Location                               |
| ---------------- | ------------------ | -------------------------------------- |
| Unit             | Vitest             | `apps/api/src/**/*.spec.ts`            |
| HTTP integration | Vitest + Supertest | `apps/api/test/**/*.spec.ts`           |
| Unit (mobile)    | Vitest             | `apps/mobile/src/**/*.spec.ts`         |
| Component, hooks | jest-expo + RNTL   | `apps/mobile/src/**/*.test.tsx`        |
| Unit (contracts) | Vitest             | `packages/contracts/test/**/*.spec.ts` |

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

**Error filter** (`src/common/http/api-exception.filter.spec.ts`) — every
contract error code reported verbatim through `DomainException` with its own
status (401 for `UNAUTHORIZED`, 409 for the conflict codes, 404 for the
not-found codes), the status table covering every code in
`@athar/contracts`, a domain 409 not being mistaken for a bare framework 409,
and the framework behaviours that must not change: `NotFoundException`,
`BadRequestException`, `ServiceUnavailableException`, validation details, a
body-parser style error, an unexpected error that must not leak its message, and
the correlation id precedence.

**Device layer** (`src/device/*.spec.ts`, `test/device.e2e.spec.ts`) — the
simulator on a fake clock, so minutes of drawing run instantly and no real timer
is involved: the full lifecycle, progress as a pure function of the clock (with
and without ticks, and scaled by the speed factor), pause and resume timing
across several pauses, stop, deterministic fault injection (every Nth job, at a
given progress, never while paused), a table going offline or into error, a
second start being refused as busy, rejected trajectories and durations,
ordered events, a throwing listener not breaking anything, and every status and
event saying `mode: 'simulation'` and validating against the shared contract.
The polar path-length maths is checked against independent numerical
integration. The factory is checked for `TABLE_MODE=hardware` refusing with the
documented message, and the application test checks that the refusal happens
while the application is built and that the driver stops ticking on close.

**Tables and admin** (`src/tables/*.spec.ts`, `test/tables*.e2e.spec.ts`) — one
repository contract suite run against both the in-memory and the JSON-file
implementation; the JSON file's own guarantees: created when missing, ten kinds of
corrupt or invalid file each refusing to start with the file untouched, atomic
writes (temporary file in the same directory, renamed over the target, nothing
left behind, previous contents intact and memory in agreement when the rename
fails, transient Windows renames retried, leftovers cleaned, concurrent changes
serialised), and the writer lock (second writer refused, readers allowed, released
on close, stale lock taken over). The admin routes are tested for every way of
failing authentication, for the single identical response they all produce, for
never echoing a token, and for refusing a customer (`FORBIDDEN`). Over HTTP: create
(server-generated ids, ignored caller ids, validation), list, get, partial update,
the QR link in both forms, the public endpoint (a disabled table returned with
`enabled: false`, unknown and invalid ids), and persistence of tables, accounts
and sessions across a restart through the real files. Accounts and sessions
(`src/auth`, `test/auth.e2e.spec.ts`): scrypt round trip, token hashing, refresh
rotation and reuse revoking the session, expiry and the absolute session limit on
a fake clock, the sign-in throttle, one answer for every sign-in failure,
activation (single use, 72 h), and `admin:create` (never a password argument,
respects the lock). Also the environment rules for `PUBLIC_LINK_BASE_URL`, log
redaction of tokens, passwords and codes, id generation (checked against the RFC 4648 vectors), and both commands
(`table:qr` writes a real SVG and a PNG of at least 1024 px; `table:create` shares
the service and respects the lock).

**Designs** (`src/designs/**/*.spec.ts`, `test/designs.e2e.spec.ts`) — the
four trajectory generators: each stays inside rho 0..1 with a margin at the rim,
starts and ends at the home radius, is continuous (no jump, and sampled finely
enough that the table's polar interpolation draws what was intended), keeps theta
unwrapped, and is deterministic; plus what is particular to each (the dunes' two
arms never cross, the Al Sadu rows are two zigzags exactly out of step, the star
passes through every corner and each star's points land in the notches of the next,
the fronds are eight identical strokes that never touch). The collection rules:
exactly four, unique ids and slugs, the inspiration rule, English and Arabic
present and in the right script, the trajectory rules, and **that every cited
source is on a list of pages that were actually opened**, so an unread source cannot
slip into the data. The preview path (size, fidelity, length, corners kept). The
endpoints (no credentials, English and Arabic round-trip as UTF-8, never the
trajectory, unknown and invalid ids), the SVG renderer and the `designs:svg`
command.

**Drawing jobs** (`src/jobs/*.spec.ts`, `test/journey.e2e.spec.ts`) — the state
machine walks the **whole 6 x 7 matrix** of states against triggers (ten allowed,
thirty-two rejected) against a table written out independently of the shared data,
and every allowed transition for what it sets (`startedAt`, `finishedAt`, the error
code, progress never going down and being 1 only for a completed job); driver
reports are checked for how they become transitions and for what is ignored. The
repository: a hundred simultaneous starts yield exactly one job, identical
simultaneous requests yield one job and return it to the rest, a repeat is decided
before busy, history is bounded per table, a forgotten job takes its idempotency
entries with it, and a running job is never forgotten. The service, with the
simulator and with a scripted driver for what the simulator cannot be made to do (a
lagging status, a nonsensical report, an unexpected error): the documented order of
checks, a refused or crashed start never leaves the table held, events applied in
order and never mid-command, commands judged on fresh state, the log lines and their
absence of personal data.

**The whole journey over HTTP** (`test/journey.e2e.spec.ts`), on a fake clock at
speed 100, so that nothing waits: a table created through the admin API, fetched,
the designs listed, a job started, a double tap replayed (`200`), a second start
refused (`TABLE_BUSY`), a different design under the same request id refused
(`IDEMPOTENCY_CONFLICT`), progress watched, paused (frozen however long it waits),
pause refused twice over (`INVALID_TRANSITION` naming the state), resumed,
completed at progress 1, the table free again, history newest first, and a second
drawing. Then every way it can go wrong: an injected fault (`SIMULATED_FAULT`),
stop, stop while paused, a table offline before and during a drawing and while
paused, a disabled table (reads work, a repeat still finds its job, new starts are
refused, a running job can still be stopped), every unknown id in the documented
order, every validation failure, a start the driver refuses, five simultaneous
identical taps and five simultaneous different ones, two tables at once, a stop that
races a completion, bounded history, and **a restart** (a new application instance:
`JOB_NOT_FOUND` for the old job, the table free, the old request id a new request).
`/ready` is checked for the `table-driver` probe and `tableMode`, and `/health` for
being unchanged.

How to drive time in a test: `createTimedApp()` (in `test/create-test-app.ts`)
builds the real application with a `FakeClock` and a `ManualScheduler` shared by the
driver, the tables and the jobs. `advance(seconds)` moves the clock, runs the
simulator's tick and waits for the jobs to apply what it reported, so a test reads
the result of a drawing that would take minutes without waiting for one.

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

### Contracts

**State machine** (`packages/contracts/test/drawing-job.spec.ts`) — the full
state x trigger matrix against an expected map written independently of the
data, terminal states having no exits, and the active/terminal partition.
**Schemas** (`design`, `table`, `device`, `admin`, `errors` specs) — the
documented-traditional-needs-a-source rule, table-id validation, driver status
requiring `mode`, the admin requests and QR payload, and the error codes.

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

**Components, hooks and screens** (`src/**/*.test.tsx`) — the table screen in
every state (loading, unknown, disabled, offline, busy with a way to open the
running drawing, connection error with a working retry, designs error), design
cards drawing their `previewPath`; the design screen (sections, the inspiration
label by kind, the start button sending **one** request however often it is tapped,
retry with the same request id, `TABLE_BUSY` offering the running drawing, the other
refusals in plain words); the progress screen (percentage, state, drawn part following
progress, Pause/Resume/Stop, stop asking first, `INVALID_TRANSITION` refreshing, the
finished job handing over once, a forgotten job, a dropped connection keeping the last
picture); the result screen's wording for every mode and state; `useJob` on a fake
clock (the schedule, stopping at each terminal state, doubling and capping the wait,
recovery, not polling while inactive, resuming at once when active again, aborting on
unmount); `useStartJob`; `useQrScan` (one navigation however many frames); the
resource hooks aborting on unmount; `Button`, `ModeBadge`, `DesignPreview`. Pure rules
sit in `*.spec.ts` beside them: polling rules, result wording, table-screen
classification, camera-permission classification, link and code parsing, the preview
geometry, translations (same keys in both languages, no technical words in errors),
theme contrast.

## Notes on the toolchain

**The mobile package has two runners, split by file name.** `*.spec.ts` runs under
Vitest in Node and must not import `react-native`; `*.test.tsx` runs under Jest with the
`jest-expo` preset and Testing Library. Vitest cannot load React Native's Flow-typed
sources without re-implementing what `jest-expo` already does (Expo module mocks, the
asset transform), so rendering needs Jest; the existing pure specs stay on Vitest because
they are faster and already pass. This keeps "pure-logic specs runnable without a
renderer" (the earlier plan here was a single Jest runner for everything; the cost of
two is one extra config file, `jest.config.js`, and `jest-resolver.js`, which lets Jest
read `@athar/contracts` from source like every other consumer). `pnpm test` runs both.
Testing Library 13 is used with `react-test-renderer` 19.2.3 (the version `jest-expo`
bundles); version 14 needs a different renderer package.

**The API test runner uses SWC, not esbuild.** NestJS resolves dependencies
through `emitDecoratorMetadata`, which esbuild (Vitest's default) does not
implement. Without SWC, `Test.createTestingModule()` would fail to inject
anything. See `apps/api/vitest.config.ts`.

**Tests use forked workers.** Each spec builds its own Nest application; separate
processes keep signal listeners and HTTP servers isolated.

**Contracts are read from source in tests.** Both Vitest configs alias
`@athar/contracts` to `packages/contracts/src/index.ts`, so a contract change is
visible to the next test run without rebuilding `dist/`. Type checking does the
same through the `athar-source` export condition (see
[architecture.md](architecture.md#monorepo-mechanics)).

**The mobile Vitest config is `vitest.config.mts`.** The package is CommonJS
because Metro and Expo load their config files with `require`; an ES module
config named `.ts` is loaded as CommonJS and Vite warns about it.

**Test output is quiet.** The API's application logs go through pino, so the
`LOG_LEVEL=silent` that the test configuration sets applies to them too.

**Integration tests build the real application.** They call
`createConfiguredApp(createTestConfig())` with an explicit configuration, so
they never depend on a developer's `.env`, shell environment or listening port.

## Deliberately not covered

**Real devices and the camera.** Rendering is tested; the camera preview, the
permission prompt, link handling by the operating system, the native header's mirroring
in Arabic and font loading are not, and need a phone (below).

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

### The whole journey, on an emulator

Run on 2026-10-11 on the Android emulator `Medium_Phone_API_36.1` with Expo Go and the
development server, against a real API process with a JSON tables file (two tables, one
disabled), `SIMULATION_SPEED_FACTOR` of 20 and then 3. "Screenshot" means an `adb`
screenshot of the app; "curl" means the API was asked directly; "log" is the API's own
log. A step is listed as passed only if it was observed that way.

| Step                                                         | Observed                                                                                                                                                                                                    | How                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Home screen                                                  | Brand, tagline, "Scan your table", "Enter table code", language switch, "Connection details"; bundled Plex font renders                                                                                     | screenshot                            |
| Open a table (typed id)                                      | Name, location, Simulation badge, "Status: Ready to draw", four designs with their previews                                                                                                                 | screenshot                            |
| Open a table by link (`exp://…/--/t/<id>`, the Expo Go form) | Opens the table directly                                                                                                                                                                                    | screenshot                            |
| Open a design                                                | Large preview, badge, title, description, "Modern interpretation", sources, "About 14 min", Start                                                                                                           | screenshot                            |
| Start with a double tap                                      | Exactly one job created                                                                                                                                                                                     | curl (one job in the table's history) |
| Progress                                                     | Drawn part in the strong colour following progress from the centre, percentage, "Drawing", Pause and Stop                                                                                                   | screenshot                            |
| Pause, then resume                                           | `paused` at 0.286, unchanged 3 s later; `drawing` again at 0.359 after Resume; "Paused" with Resume shown                                                                                                   | curl, screenshot                      |
| Completion                                                   | The app moved to the result by itself: "Simulated drawing completed", badge, "Nothing was drawn on a real table"                                                                                            | screenshot, curl (`completed`, 1)     |
| Draw again                                                   | Back to the table with the four designs; a second drawing (the star) was then started from it. That a new request id was used is covered by tests, not observed                                             | screenshot, curl                      |
| Stop                                                         | Confirmation dialog ("Stop this drawing?", Keep drawing / Stop drawing); then `cancelled` at 0.71 and "The simulated drawing was stopped"                                                                   | screenshot, curl                      |
| Injected fault (`SIMULATION_FAULT_EVERY_NTH_JOB=1`, at 0.5)  | Job `failed` at 0.5 with `SIMULATED_FAULT`; "The simulated drawing could not be finished — A simulated problem was introduced for testing."                                                                 | curl, screenshot                      |
| Unknown table                                                | "Table not found" with "Scan another code"; the API answers `TABLE_NOT_FOUND`                                                                                                                               | screenshot, curl                      |
| Disabled table                                               | "This table is switched off", no designs, "Status: Switched off"                                                                                                                                            | screenshot                            |
| Table busy, opened fresh                                     | "Status: Drawing now", "This table is drawing", "Watch the drawing"                                                                                                                                         | screenshot                            |
| Second start while busy                                      | API answered 409 `TABLE_BUSY` (warn-level log line); the app shows "This table is already drawing. Please wait for it to finish.", "Watch the running drawing" and Start                                    | log, screenshot                       |
| API stopped mid-drawing                                      | The last picture stays (7 %), "Connection lost. Trying again…", Pause and Stop still shown                                                                                                                  | screenshot                            |
| API started again                                            | Jobs are gone (memory): "This drawing is no longer available" with "Back to the table"; the table itself survived the restart                                                                               | screenshot, curl                      |
| Production-mode API                                          | `NODE_ENV=production` with no key or link base refuses to start and lists both; with them it serves `/ready`, JSON logs, `tableMode: simulation`; a second process on the same tables file refused to start | log, curl                             |

**Defects found by this walk-through, fixed, each with a test that failed first:**

1. The table screen kept showing the status from before a drawing when the user came
   back to it ("Draw again", or Back), e.g. "Ready to draw" while the table was busy. It
   now reads the table again, in the background, whenever it regains focus
   (`TableScreen.test.tsx`, "reads the table again when the screen comes back into
   view"). Re-observed on the emulator: Back from a design showed "Drawing now".
2. A disabled table said "Status: Ready to draw" above "This table is switched off". The
   status line now says "Switched off" (`TableScreen.test.tsx`). Re-observed on the
   emulator.

**Seen, not changed (not defects, or outside the brief):**

- `pnpm dev:api` restarts the API whenever a built file changes, which forgets running
  drawings; during the walk-through that made one start time out ("This is taking longer
  than expected"). That is the documented development behaviour; the rest of the walk
  used the production start command, which does not restart.
- The "no longer available" screen repeats its title as its body, and a refused start
  shows "Something went wrong" above the specific reason ("This table is already
  drawing…"). Both read fine but could be tidier.
- The design thumbnails and the whole-path line are drawn in a pale colour; legible at
  phone size on the sand-coloured card, faint on a dim screen.
- A leftover API process and an Expo server from earlier work were already running on this
  machine (ports 3000 and 8081); the API one had to be stopped to continue.

**Not observed — do not treat as passed:**

- **Scanning a QR code with the camera.** The emulator has no camera input here, so the
  scanner screen, the camera permission prompt and the denied-permission fallback were
  never opened on a device. The link parser, the scan hook (one navigation per scan, an
  inline message for unknown codes) and the permission classification are unit-tested.
- **A physical phone** and **iOS**: no device was connected.
- **Arabic on a device:** the language switch, right-to-left mirroring and the restart it
  needs were not exercised; Arabic is covered by rendering tests only.
- **A release or preview build**, HTTPS links, and the QR code printed from a production
  link.
- The walk-through used one table at a time and one client; there was no concurrent use
  by two phones, other than a second client simulated with curl.

### The visual redesign, on an emulator

After the journey above, the interface was restyled (sand discs, gold ring, elevation,
home ornament, motion). Looked at on `Medium_Phone_API_36.1` against the same API, by
screenshot, in these states: home, table, design, progress (ring following progress),
result, all in light mode; home and result in dark mode; home, table and design in
**Arabic with right-to-left layout, which had not been seen on a device before**. The
language switch restarted the app by itself in development and the layout mirrored
correctly: text and cards aligned to the start edge, the chevron pointing the other way,
the gold bar and the ornament on the start edge, the disc pictures left unmirrored. Issues
found while looking, fixed: the ornament's lines ran through the tagline, and the clock
icon drew only its hands. Not looked at: the scanner screen, the error and offline
states, dark mode on the table, design and progress screens, and Arabic on the progress
and result screens. Animations were seen only as stills.
