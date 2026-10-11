# Future infrastructure decisions

Nothing here is installed. Each entry records the requirement that would
justify adding the dependency, and where it would plug in. Adding a dependency
is a decision with an operational cost, so it should be made against a concrete
need rather than in anticipation of one.

## Hardware integration (the expected next step)

### Decision: the table connects to the backend, not to the phone

**The table connects to the backend over the network. The phone never talks to
the table directly.** The two entries below were written before this decision
and are **superseded** by it.

_Why:_ ATHAR tables are placed in public venues and play unattended, so a
drawing cannot depend on a visitor's phone staying nearby and connected; and
routing everything through the backend gives a single place for access control
and job rules, instead of one set in the app and another on the table.

Consequences:

- The future `HardwareTableDriver` lives on the **backend side**, behind the
  existing `TableDriver` interface (see
  [architecture.md](architecture.md#2-tabledriver-interface)). It talks to a
  controller on the table over the network, most likely through a separate
  gateway process that holds the long-lived connections (see "Device broker /
  WebSocket gateway" under Reliability).
- Device drivers therefore **do** belong on the API side (behind the interface,
  never imported by domain modules), which reverses the "stay out of
  `apps/api`" placement in the superseded entry below.
- The mobile app needs no radio permissions, no native BLE module, and stays on
  Expo Go as far as the table link is concerned. The mobile app talks to the
  API only.
- The transport between backend and table controller (and the controller
  hardware) is still undecided; see
  [architecture.md, open decisions](architecture.md#9-open-decisions).

**BLE library** (`react-native-ble-plx` or equivalent) — **superseded**

_Superseded by the decision above: the phone does not connect to the table._

- _Original trigger:_ the table begins pairing with or controlling a device over
  BLE.
- _Original consequence:_ a native module, so the project moves from Expo Go to
  a Development Build (`eas build --profile development`).
- _Still true, independently of BLE:_ a development build that talks to a local
  HTTP API needs `expo-build-properties` with `android.usesCleartextTraffic`
  enabled. Bluetooth and location permissions are no longer needed.

**Device connection layer** (`apps/mobile/src/hardware/`) — **superseded**

_Superseded by the decision above: there is no mobile-side device layer. The
equivalent abstraction is the API's `TableDriver`._

- _Original shape:_ a transport-agnostic interface (`connect`, `disconnect`,
  `send`, `onFrame`) with BLE and later transports as implementations, placed
  mobile-side only.

**Device protocol and contracts** (`packages/contracts`)

- _Trigger:_ the first device message format is fixed.
- _Note:_ device framing is **not** the same contract as the HTTP API. Give it a
  separate module (`packages/contracts/device`) so a protocol revision does not
  force an HTTP version bump.

## Persistence

**Database (PostgreSQL)**

- _Trigger:_ the first requirement to store data the app cannot own, such as
  device registry, calibration history or a shared account profile.
- _Before adding it:_ settle retention, backup and migration policy. A schema
  migration strategy is harder to retrofit than to plan.

**ORM / query layer**

- _Trigger:_ decided alongside the database, not before. Prefer the database's
  own migration tool (Prisma, Drizzle, Knex) so schema history is the source of
  truth.

**Cache (Redis)**

- _Trigger:_ a measured need — repeated expensive reads, rate limiting across
  instances, or a job queue.
- _Note:_ do not add it to "scale ahead of time". A single-instance service
  does not need one, and in-process caching is enough until it does.

## Reliability

**Job queue**

- _Trigger:_ work that must survive a restart or run on a schedule (telemetry
  rollups, firmware broadcasts, notifications).

**Device broker / WebSocket gateway**

- _Trigger:_ table controllers hold long-lived network connections to the
  backend (see the hardware decision above), or the app needs live push while it
  is open.
- _Where:_ a dedicated gateway service, not the HTTP API. NestJS can host it,
  but a separate process keeps long-lived connections away from request
  handling. The API's `HardwareTableDriver` is the client of this gateway.

**Object storage**

- _Trigger:_ firmware images, device certificates or diagnostic bundles need to
  be stored.

## Identity and access

**Authentication**

- _Trigger:_ the product requires accounts or per-user data.
- _Consequence:_ must arrive before any persisted data exists, or every table
  needs a retrofit for ownership.
- _Where:_ the API only. The mobile app never holds a long-lived privileged
  credential; a server-issued, revocable token is the expected shape.

**Authorization** — follows authentication, and follows the resource model.

**Payments** — out of scope until the commercial model is decided.

## Platform and delivery

**CI/CD**

- _Trigger:_ requested, or the first shared branch needing enforced checks.
- _Note:_ none is configured today. When added, the pipeline should run exactly
  `pnpm check` plus a mobile build, so the gate matches local behaviour.

**Docker / orchestration**

- _Deliberately omitted._* The current setup works reliably with Node alone.
  Docker should be introduced when deployment needs reproducibility or a
  specific runtime, and the API already honours `HOST`/`PORT`/`NODE_ENV` so it
  containerises without code changes.

**Observability**

- _Trigger:_ running multiple instances, or needing metrics/traces.
- _Note:_ the API already emits structured JSON logs, which is the
  prerequisite. Add a metrics endpoint and a tracing SDK at that point rather
  than now.

**Rate limiting**

- _Trigger:_ the API becomes internet-facing and is at risk of abuse.

## Mobile platform

**Web target** (`react-dom`, `react-native-web`)

- _Trigger:_ a web client is actually wanted. The current app targets Android
  and iOS only; this is why `pnpm install` reports unmet `react-dom` peers —
  those come from Expo packages that support web and are harmless here.

**Over-the-air updates**

- _Trigger:_ production distribution exists and patch latency matters.

## Decisions already taken

| Decision               | Choice                            | Rationale                                                                                                          |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Package manager        | pnpm workspaces                   | Fast, strict, workspace-aware; Metro is configured explicitly                                                      |
| Backend framework      | NestJS 12 (ESM)                   | NestJS 12 is ESM-only; the whole service is ESM, not CJS                                                           |
| Build tool for the API | `tsc` (no `@nestjs/cli`)          | The Nest CLI crashes on Node 20 with an ESM/CJS require cycle; `tsc` does the same job with far fewer moving parts |
| Validation             | Zod everywhere                    | One library for env, request and response validation                                                               |
| Test runner            | Vitest both sides                 | One runner; SWC provides the decorator metadata Nest requires                                                      |
| ESLint                 | v9 flat config                    | ESLint 10 exceeds the peer range of Expo's `eslint-plugin-*`                                                       |
| Device link            | Table → backend, over the network | The phone never talks to the table: public venues, unattended playback, one place for access control and job rules |
| Docker                 | Not used                          | Adds no value until deployment requires it                                                                         |
| CI/CD                  | Not configured                    | Out of scope; `pnpm check` is the local equivalent                                                                 |
