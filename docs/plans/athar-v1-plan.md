# Athar v1 plan: owned tables, secure sessions, simulator-first drawing

Status: proposal, 2026-10-15. Executed phase by phase with `/claude-mem:do`.

## Primary goal

A customer who ordered an Athar table signs in to the app (English or Arabic), scans their table and
gets the features their order includes. A drawing runs only when their own table is online, paired
with their phone and free. An admin signs in to a separate secure area to register orders: table,
owner, plan and the voice-assistant option. Everything works against the simulated table before any
hardware exists.

## Inputs this plan is built from

- Current code at `0965207`. The journey scan → table → design → job → result already exists, end to
  end and simulated (`apps/api/test/journey.e2e.spec.ts:69`). **`docs/gap-analysis.md` §4 is stale**
  and is not a source.
- The code review of `0965207`: 10 findings, listed in Phase 1.
- The product brief: simulator first, advanced features, no drawing without a connection to the
  table, a voice-assistant admin flag, basic and personalized plans, a modern and attractive design,
  EN + AR, solid admin and user sessions, and animations.
- athaar.ae (`/en`, `/en/product`):
  - One table model, 1.7 × 1.3 m.
  - Every table: steel ball in sand, a picture library of Emirati landmarks, the drawing pen
    (finger sketch), 6 LED ambiences (named: Gulf blue, amber, pearl) and auto-rake.
  - Option: motion sensor + voice assistant "ATHAR".
  - Tone: calm, heritage, "Leave a trace", "Draw anything. The sand remembers."
  - EN/AR.
- The owner's answers in this session:
  - Drawing conditions: the table is **online + paired + free**.
  - Plans: basic = the catalogue. Personalized = the advanced features. The admin sets the plan.

## Decisions taken by this plan (change here, not in code)

| #   | Decision             | Default chosen                                                                                                                                                                                                                                                                                                   |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Who may use a table  | Only accounts linked to it by the admin (the order's owner). The QR code identifies a table; it never authorises.                                                                                                                                                                                                |
| D2  | Where the plan lives | On the table (the order). Entitlements come from `table.plan` plus `table.voiceAssistant`.                                                                                                                                                                                                                       |
| D3  | Plan contents        | `basic`: catalogue designs and rake. `personalized`: adds the drawing pen and LED ambiences. **Conflict:** the website lists the pen and LED as standard on every table. The plan map is one constant in contracts (`PLAN_FEATURES`), so moving a feature between plans is a one-line change.                    |
| D4  | Voice assistant      | Per-table admin flag, independent of plan (the site sells it as an add-on with the motion sensor). In simulation it is a flag and a UI capability only.                                                                                                                                                          |
| D5  | Session model        | Opaque random tokens, stored only as SHA-256 hashes. Access token 15 min; refresh token rotated on every use with reuse detection (a reused refresh token revokes the whole session). Customer session up to 30 days, admin session up to 12 h. Server-side revocation. No JWT.                                  |
| D6  | Passwords            | `node:crypto` scrypt (salt 16 bytes, keylen 64, N=16384, r=8, p=1), compared with `timingSafeEqual`. Minimum 10 characters.                                                                                                                                                                                      |
| D7  | Customer onboarding  | The admin creates a customer, which returns a one-time activation code (10 chars, single use, 72 h, stored hashed). The customer enters email + code + new password in the app. A lost password works the same way: the admin resets access, which revokes all sessions and issues a new code. No email sending. |
| D8  | Admin identity       | Admin accounts with role `admin`, created by CLI (`pnpm --filter @athar/api admin:create`). `ADMIN_API_KEY` is removed, leaving one auth path.                                                                                                                                                                   |
| D9  | Pairing              | `POST /api/v1/tables/:tableId/pairing` by the table's owner opens a 15-min sliding pairing for (account, table, session). In simulation it proves "this signed-in owner opened this table recently". The hardware phase will add proof of presence (a code shown on the table).                                  |
| D10 | Persistence          | Same JSON-file store pattern as tables (atomic write + lock), extracted once into a shared helper. Shortcut: one API process only; move to Postgres before running more than one instance.                                                                                                                       |
| D11 | Animations           | React Native's built-in `Animated` API (native driver), with no new dependency. Every animation is skipped when the OS "reduce motion" setting is on.                                                                                                                                                            |
| D12 | Sharing              | React Native's built-in `Share.share` with text and the brand line. No image capture in v1.                                                                                                                                                                                                                      |

## Phase 0: Documentation discovery (done)

**How this serves the primary goal:** every later phase copies patterns that already exist here, so
new code looks like the old code and nothing is invented.

### Allowed APIs and patterns, verified in this repo

**Contracts**

- Zod schema + `z.infer` type per file, `export *` in `src/index.ts` (alphabetical), `.js` import
  suffixes. Pattern: `packages/contracts/src/health.ts:29-33`.
- Endpoint shapes: `drawing-job.ts:132-188`.
- Tests: `packages/contracts/test/*.spec.ts`, importing `../src/index.js`.
- Error codes: `packages/contracts/src/errors.ts:16-33` (closed enum). Adding a code is additive.

**API**

- Domain errors: `throw new DomainException(code, message)` (`apps/api/src/common/http/domain.exception.ts`).
  The status map `ERROR_CODE_STATUS` is an exhaustive Record, so a new code fails typecheck until it
  is mapped.
- Validation: `new ZodValidationPipe(schema, 'body'|'query'|'params')`. Example:
  `apps/api/src/jobs/table-jobs.controller.ts:34-51`.
- Modules: `XModule.forRoot(...)` registered in `app.module.ts:37-61`. Simple module:
  `health/health.module.ts:6-10`.
- Guard template: `apps/api/src/tables/admin-key.guard.ts` (+ `.spec.ts`).
- Config: `environment.schema.ts` → `AppConfig` (`app-config.ts:14-43`) → `createAppConfig` →
  `.env.example` → `docs/environment-configuration.md`. Nothing else reads `process.env`.
- Time: `Clock`/`Scheduler` in `device/clock.ts`; `FakeClock`/`ManualScheduler` in `device/fake-clock.ts`.
  Token expiry must use `Clock`, never `Date.now()`.
- JSON-file persistence with lock: `apps/api/src/tables/json-file-table.repository.ts`. In-memory twin
  for tests: `in-memory-table.repository.ts`.
- CLIs: `apps/api/src/cli/table-create.ts`, `table-qr.ts`.
- Tests: unit `src/**/*.spec.ts`; HTTP `test/**/*.spec.ts` via `createTestApp`/`createTimedApp`
  (`test/create-test-app.ts`). Journey template: `test/journey.e2e.spec.ts:27-120`.
- Node built-ins for auth: `crypto.scrypt`, `crypto.randomBytes`, `crypto.timingSafeEqual`,
  `crypto.createHash('sha256')`. Node is v20.19.2: **no `node:sqlite`**.

**Mobile**

- HTTP: `HttpClient.get(path, schema, opts)` / `post(path, body, schema, opts)`
  (`apps/mobile/src/api/http-client.ts:205,219`). There is no PATCH; add one only if a phase needs it,
  copying `post`.
- Typed client methods: `athar-api-client.ts:86-92` (GET), `:119-126` (POST).
- Data hooks: `features/use-resource.ts:29`. Polling: `features/jobs/useJob.ts` + `polling.ts`.
- Routes: Expo Router under `src/app/`. Path builders: `src/navigation/routes.ts`. Providers mount
  only in `src/app/_layout.tsx`.
- i18n: `src/i18n/en.ts`, `ar.ts`, with a parity test in `translations.spec.ts`. Every new string goes
  in both files. RTL is handled in `direction.ts`.
- Theme tokens: `src/theme.ts` (colours, spacing, radius, typography, `MIN_TOUCH_TARGET = 48`).
- Tests: Vitest `*.spec.ts` (node, pure logic) and Jest `*.test.tsx` (components/hooks), with helpers
  in `src/test-utils.tsx` and `src/test-fixtures.ts`.
- RN built-ins to use: `Animated` (`useNativeDriver: true`), `AccessibilityInfo.isReduceMotionEnabled`
  plus the `reduceMotionChanged` listener, `Share.share`, `PanResponder`.
- **New dependency, the only one:** `expo-secure-store`, installed with
  `pnpm --filter @athar/mobile exec expo install expo-secure-store` so the SDK-57-matched version is
  chosen. Use `setItemAsync`, `getItemAsync` and `deleteItemAsync` only.

### Anti-patterns for every phase

- Do not plan from `docs/gap-analysis.md` §4: it describes code that no longer exists that way.
- No JWT library, no passport, no bcrypt/argon2 packages, no AsyncStorage for tokens, no
  react-native-reanimated, Lottie or Moti, no new data-fetching library.
- Never store a raw token, activation code or password. Store only hashes.
- Never compare secrets with `===`; use `timingSafeEqual` on equal-length buffers.
- Never read `process.env` outside `src/config` (API) or `config/env.ts` (mobile).
- Never `res.status().json()` an error. Throw a `DomainException`.
- Never call `Date.now()` in domain code. Inject `Clock`.
- Never add a string to only one of `en.ts` / `ar.ts`.
- Stored JSON written by an older version must still load: every new stored field gets a Zod
  `.default(...)`.

---

## Phase 1: Stabilise what exists

**How this serves the primary goal:** sessions and ownership will be stored with the same file lock
and served by the same job code. Their known crash and race bugs must be gone first, or the new
features inherit them.

### What to implement

Fix each code-review finding and add a regression test next to the existing spec of that file.

1. `json-file-table.repository.ts:386`: treat a lock whose holder PID equals `process.pid` as stale.
2. `bootstrap.ts:162`: when `app.listen` fails, close the app and release the repository lock. Copy
   the cleanup already done on the build-failure path of `createConfiguredApp`.
3. `json-file-table.repository.ts:247`: `enqueue` rejects after `close()`.
4. `mobile/features/jobs/useJob.ts:87`: ignore a poll response whose `updatedAt` is older than
   `latest.current`.
5. `useJob.ts:75`: reset `latest` and the reducer when `jobId` changes.
6. `mobile/linking/parse-table-link.ts:73`: lowercase the id before `validateId`, as `parseTableCode`
   does.
7. `environment.schema.ts:145`: `PUBLIC_LINK_BASE_URL` must be https with no port, no username and no
   password. Alternatively, make `HTTPS_LINK` in mobile accept a port. **Choose rejection at the
   server**, so the QR code and the app always agree.
8. `tables.service.ts:32`: derive `activeJobId` after the driver's settle event has been applied.
   Read through the `JobsService` queue, not around it.
9. `environment.schema.ts:80` (`ADMIN_API_KEY` whitespace): **obsolete after Phase 2**, which removes
   the key. Skip.
10. `jobs.service.ts:199`: pass the already-loaded `design` into `hand()`; look up once in
    `DesignsService.get`.

Remaining gap-analysis §3 items:

- Add `.github/workflows/check.yml` running `pnpm install --frozen-lockfile` and `pnpm check` on Node
  20 with pnpm 10, on push and PR.
- Make `pnpm lint` also lint `packages/config` and root JS files: add a root `lint:root` script
  (`eslint eslint.config.js packages/config apps/mobile/metro.config.js`) and chain it in `lint`.
- Cosmetic:
  - `shutdown-coordinator.service.spec.ts:54,63`: emit with the signal argument.
  - Remove the unused `@/*` alias from `apps/mobile/tsconfig.json:12`.
  - `pnpm-workspace.yaml:10`: fix the comment.
  - `docs/future-infrastructure-decisions.md:134`: remove the stray `*`.
  - `docs/architecture.md:37`: write `src/bootstrap.ts`.
- Put a "Superseded, see `docs/plans/athar-v1-plan.md`" banner on `docs/gap-analysis.md`.

### Verification

- `pnpm check` passes.
- Each fixed finding has a test that fails on `0965207` and passes now. Name each test after the
  scenario in the finding.
- The workflow file passes `actionlint`, or at least valid YAML (`npx yaml-lint`, if available; else
  skip and say so).

### Anti-pattern guards

- No behaviour change beyond the finding.
- Do not refactor the repository while fixing it (Phase 2 extracts the helper).

---

## Phase 2: Accounts and sessions (API)

**How this serves the primary goal:** "solid admin and user sessions" and "only the owner draws" both
need a real identity on every request.

### What to implement

**Shared persistence**

- Extract the lock + atomic-write + queue part of `json-file-table.repository.ts` into
  `apps/api/src/common/persistence/json-file-store.ts`.
- Keep the table repository's public interface unchanged; all of its tests must still pass untouched.

**Contracts: `packages/contracts/src/auth.ts`**

- `accountRoleSchema = z.enum(['admin','customer'])`.
- `loginRequestSchema {email, password}`.
- `activateRequestSchema {email, activationCode, password}`.
- `refreshRequestSchema {refreshToken}`.
- `sessionResponseSchema {accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, account:{id, email, displayName, role}}`.
- `meResponseSchema`.
- New error codes in `errors.ts`, each mapped in `ERROR_CODE_STATUS`:
  - `INVALID_CREDENTIALS` 401
  - `SESSION_EXPIRED` 401
  - `FORBIDDEN` 403
  - `TOO_MANY_REQUESTS` 429
  - `ACTIVATION_INVALID` 400
  - `PAIRING_REQUIRED` 409
  - `FEATURE_NOT_IN_PLAN` 403

**API module `apps/api/src/auth/`**

- `password-hasher.ts`: scrypt per D6. Format: `scrypt$16384$8$1$<salt b64>$<hash b64>`.
- `token.ts`: `randomBytes(32)` as base64url, and `sha256` for storage.
- `account.repository.ts`: interface, plus JSON-file and in-memory implementations, copying the
  table repository pair.
  - Account: `{id, email (lowercased, unique), displayName, role, passwordHash|null, activationCodeHash|null, activationExpiresAt|null, createdAt, updatedAt, disabled}`.
- `session.repository.ts`: same pattern.
  - Session: `{id, accountId, role, accessHash, accessExpiresAt, refreshHash, refreshExpiresAt, previousRefreshHash, createdAt, lastUsedAt, revokedAt}`.
  - An in-memory index by `accessHash` for O(1) lookup.
- `auth.service.ts`: `login`, `activate`, `refresh` (rotation + reuse detection per D5), `logout`,
  `revokeAllFor(accountId)`. Every expiry check uses `Clock`.
- `login-throttle.ts`: in-memory, at most 5 failures per (email, IP) per 15 min. The answer is
  `TOO_MANY_REQUESTS`.
  - `shortcut: in-memory and per-process, reset on restart; move to the shared store with Postgres.`
- `session.guard.ts` + `@Roles(...)` decorator (Nest `SetMetadata` + `Reflector`). Copy the structure
  of `admin-key.guard.ts`.
  - Reads `Authorization: Bearer <access>`, attaches `request.account`.
  - Answers `SESSION_EXPIRED` or `UNAUTHORIZED`.
- `auth.controller.ts`:
  - `POST /auth/login`
  - `POST /auth/activate`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /auth/me`
  - Login and activate return the same `INVALID_CREDENTIALS` / `ACTIVATION_INVALID` message whether
    or not the email exists.
- CLI `src/cli/admin-create.ts`, script `admin:create`, copying `table-create.ts`. It prompts for the
  password on stdin, or reads `--password-stdin`, and never takes the password as an argv value.

**Replace `ADMIN_API_KEY`**

- Admin routes use `SessionGuard` + `@Roles('admin')`.
- Remove the key from the env schema, `.env.example`, docs and test helpers.
- `createTestApp` gains helpers that seed an admin and a customer and return their access tokens.

**Env vars**

- `ACCOUNTS_DATA_FILE` and `SESSIONS_DATA_FILE`, with defaults next to `TABLES_DATA_FILE`.
- Token lifetimes as constants in `auth/`, not env. Keep the config surface small.

### Verification

Unit tests:

- hasher round trip, and a wrong password fails;
- token hash is stable;
- refresh rotation: an old refresh token used twice revokes the session;
- expiry with `FakeClock`;
- throttle locks at the 6th failure and clears after 15 min of fake time.

e2e:

- login, `me`, refresh, logout, then `me` → 401;
- a customer token on an admin route → 403;
- no token → 401;
- an expired token → `SESSION_EXPIRED`.

Grep checks:

- `grep -rn "ADMIN_API_KEY" apps docs packages` → none.
- `grep -rnE "Date\.now\(\)" apps/api/src/auth` → none.
- `grep -rn "=== .*token\|token ===" apps/api/src/auth` → none.

`pnpm check` passes.

### Anti-pattern guards

No JWT/passport/bcrypt. Never log tokens, codes or passwords: add `authorization` and the auth body
fields to the pino redaction list in `logging/create-logger.module.ts`. Never return
`passwordHash` or any `*Hash` field in a response.

---

## Phase 3: Orders and entitlements (API)

**How this serves the primary goal:** each customer gets exactly what their ordered table includes,
and the admin can set it, including the voice assistant.

### What to implement

**Contracts**

- `planSchema = z.enum(['basic','personalized'])`.
- `featureSchema = z.enum(['catalogue','rake','drawingPen','ledAmbiences','voiceAssistant'])`.
- `PLAN_FEATURES: Record<Plan, readonly Feature[]>` per D3.
- `featuresFor(table)` = plan features + `voiceAssistant` when `table.voiceAssistant`.

**`adminTableSchema` / create / update gain**

- `ownerAccountId: z.string().nullable().default(null)`
- `plan: planSchema.default('basic')`
- `voiceAssistant: z.boolean().default(false)`
- Update the "at least one field" refine.

**Public `tableSchema` gains** `plan`, `voiceAssistant` and `features: z.array(featureSchema)`.

**Admin customer endpoints (role admin)**

- `POST /admin/customers {email, displayName}` → `{account, activationCode}`. The code is returned
  once only.
- `GET /admin/customers`.
- `POST /admin/customers/:id/reset-access`: revoke all sessions, new code.
- `POST /admin/customers/:id/disable`.
- `POST /admin/tables/:id` create/patch with owner, plan and voiceAssistant. The owner must be an
  existing customer.

**Ownership**

- `GET /tables/:tableId`, designs, jobs and job commands now require a customer session.
- A table the account does not own answers `TABLE_NOT_FOUND`, never "forbidden", so table ids
  cannot be enumerated.
- Admins may read any table.

**Storage migration** An existing `tables.json` must load with the defaults. Add a test with a
fixture written in the `0965207` format.

### Verification

- e2e:
  - an admin creates a customer, activates, and is assigned table T with plan `personalized` and
    voice on;
  - the customer's `GET /tables/T` shows `features` including `drawingPen`, `ledAmbiences` and
    `voiceAssistant`;
  - another customer gets `TABLE_NOT_FOUND`.
- The contract tests for `PLAN_FEATURES` / `featuresFor` pass.
- The old-format fixture loads.

### Anti-pattern guards

Entitlements are computed in one place (`featuresFor`) and never re-derived in controllers or in
mobile. The activation code never appears in `GET` responses or logs.

---

## Phase 4: The drawing conditions (API)

**How this serves the primary goal:** a drawing never starts unless the owner's table is online,
paired with this phone and free. That is the owner's rule.

### What to implement

- Contract `pairingSchema {tableId, expiresAt}`, with `POST /tables/:tableId/pairing` (create or
  extend) and `DELETE /tables/:tableId/pairing`. Stored in memory, keyed by (sessionId, tableId),
  15-min sliding expiry via `Clock`.
  - `shortcut: lost on restart; the app re-pairs automatically (Phase 6).`
- `JobsService.start` checks, in this order, and stops at the first failure:
  1. session owns the table (→ `TABLE_NOT_FOUND`)
  2. table enabled (`TABLE_DISABLED`)
  3. pairing valid (`PAIRING_REQUIRED`)
  4. driver online (`TABLE_OFFLINE`)
  5. no active job (`TABLE_BUSY`)
  6. the requested feature is in `featuresFor(table)` (`FEATURE_NOT_IN_PLAN`)

  Pause/resume/stop require ownership + a valid pairing.

- `GET /tables/:tableId` adds `readiness: {paired: boolean, online: boolean, free: boolean, canStart: boolean}`,
  so the app can show why "Start" is disabled without guessing.
- Keep idempotency (`clientRequestId`) working exactly as today.

### Verification

- e2e matrix with `createTimedApp` and `driver.simulateConnection(...)`. Each failing condition
  returns its exact code; all conditions met → 201.
- Pairing expires after 15 min of fake time → `PAIRING_REQUIRED`.
- The existing journey test is updated: it pairs first, and passes.

### Anti-pattern guards

Do not put the checks in the controller. They belong in `JobsService.start`, before the driver call,
inside the existing `exclusive()` section so check-then-start cannot race.

---

## Phase 5: Advanced table features (API + simulator)

**How this serves the primary goal:** this phase delivers what the website promises and the
personalized plan sells: draw your own line, set the light, rake the sand.

### What to implement

**Contracts**

- `startJobRequestSchema` becomes a discriminated union on `kind`:
  - `{kind:'design', designId, clientRequestId}`: the current shape. Default `kind` to `'design'` so
    old clients still parse.
  - `{kind:'path', path: polarPathSchema (existing polar-path.ts, max points bounded), clientRequestId}`
  - `{kind:'rake', clientRequestId}`
- Map each kind to a feature: design→`catalogue`, path→`drawingPen`, rake→`rake`.

**Rake trajectory** A pure generator `designs/generators/rake.ts`: an outward spiral that ends at
`HOME_RHO`. Copy `dunes.ts` / `path-builder.ts`. Validate it with the same checks as catalogue
designs, but keep it out of the "exactly 4" catalogue.

**Freehand path** Validate it like a design trajectory: no jumps, within the radius, and ending at
home. If it does not end at home, append a return-home segment.

**LED ambiences**

- Data file `designs/data/ambiences.v1.ts` with `{id, name:{en,ar}, color}`. It is seeded with the
  three names the website gives (Gulf blue, amber, pearl).
- **The owner supplies the other three.** Until then only three are shown. Never invent brand names.
- `TableDriver` gains `setAmbience(tableId, ambienceId)` and `DriverStatus` gains `ambienceId`. Add a
  method to the interface; the simulator stores it.
- `PUT /tables/:tableId/ambience {ambienceId}` requires ownership + pairing + `ledAmbiences`.
- The mobile client needs `put`: add it by copying `post`.

**Voice assistant (simulation)** No behaviour beyond the flag and `features`. Document in
`docs/architecture.md` that the hardware driver will own greetings.

### Verification

- Unit: the rake generator passes trajectory validation; a path not ending at home gets the
  return-home segment; an oversized path is rejected (`VALIDATION_FAILED`).
- e2e: a basic plan starting `kind:'path'` → `FEATURE_NOT_IN_PLAN`; personalized → 201 and completes;
  ambience set → table status reflects it.
- `pnpm check` passes.

### Anti-pattern guards

Do not add a "raking" phase to the job state machine: rake is a normal job. Do not invent the
missing ambience names.

---

## Phase 6: Mobile sessions and the access flow (EN + AR)

**How this serves the primary goal:** the customer and the admin sign in once, stay signed in safely,
and are told clearly, in their language, why a drawing can or cannot start.

### What to implement

**`src/auth/`**

- `token-store.ts`: `expo-secure-store` for the refresh token only. The access token lives in memory.
- `session.ts`: a pure state machine `signedOut | signedIn | refreshing`, with Vitest tests.
- `AuthProvider` mounted in `_layout.tsx`.
- `HttpClient` gains an injected `getAccessToken` / `onUnauthorized`.
  - On 401 with `SESSION_EXPIRED`, it refreshes once (single-flight: concurrent requests wait for
    the same refresh) and retries once.
  - If the refresh fails, it signs out.

**Routes**

- `src/app/(auth)/sign-in.tsx`, `(auth)/activate.tsx`.
- A guard in `_layout.tsx` redirects signed-out users to sign-in. A deep link opened while signed out
  is kept and resumed after sign-in.

**Table screen**

- Pairs automatically on open, re-pairs on `PAIRING_REQUIRED`, and unpairs on leave.
- Shows `readiness` as three clear indicators: online / paired / free.
- The Start button explains the first failing condition.

**Strings**

- All new strings go in `en.ts` and `ar.ts`; the parity test passes.
- Arabic must be checked in RTL for sign-in, activate and the table screen.

### Verification

- Vitest: the session state machine, and refresh single-flight (two parallel 401s → one refresh
  call).
- Jest:
  - sign-in screen shows `INVALID_CREDENTIALS` and `TOO_MANY_REQUESTS` messages in EN and AR;
  - the table screen renders each readiness state;
  - a deep link while signed out resumes after sign-in.
- `grep -rn "AsyncStorage" apps/mobile/src` → none.
- The access token never written to storage: `grep -n "setItemAsync" apps/mobile/src` → only the
  refresh key.

### Anti-pattern guards

No token in logs, URLs or route params. Screens never build URLs or read tokens; they use the client
and `AuthProvider`.

---

## Phase 7: Mobile features and the admin area

**How this serves the primary goal:** customers can use every feature their table includes, and the
admin can register orders from the same app.

### What to implement

**Customer**

- Feature-gated UI driven only by `table.features`. A locked feature shows a short "included in the
  personalized plan" note.
- Drawing pen screen `t/[tableId]/draw.tsx`: `PanResponder` captures the finger path in a disc view.
  It is converted to the polar path with a pure, Vitest-tested function, previewed with the existing
  SVG `DesignPreview` and started as `kind:'path'`.
- Ambience picker (chips with colour swatches) → `PUT ambience`.
- Rake button on the table screen.
- Voice-assistant capability badge when `voiceAssistant`.

**Admin**

The admin area is a `(admin)` route group, visible only when `role === 'admin'`:

- customers: list, create (show the activation code once with a copy button), reset access, disable;
- tables: list, create, edit owner, plan and voiceAssistant, show the QR link.

Copy the list and detail patterns from existing screens.

### Verification

- Jest:
  - basic-plan table hides or locks the pen and ambiences;
  - personalized shows them;
  - an admin route redirects a customer;
  - the activation code is shown once and gone after navigation.
- Vitest: finger-points → polar path (centre, edge, clamp to radius, end at home).
- A manual run on Android emulator or Expo Go, recorded in `docs/testing.md`'s manual section: admin
  creates a customer and table → customer activates → scans → draws with the pen → result.

### Anti-pattern guards

The mobile app never decides entitlement from `plan`; it reads `features` only. The admin UI never
caches activation codes.

---

## Phase 8: Motion, brand and sharing

**How this serves the primary goal:** a calm, beautiful, animated experience in the website's
heritage tone makes people want to use the table and share it.

### What to implement

**Brand pass on `theme.ts`**

- Add `sand`, `gulfBlue`, `amber` and `pearl` tokens from the website's named ambiences.
- Keep every existing contrast assertion passing (`theme.spec.ts`).
- Taglines in EN/AR: "Leave a trace", "Draw anything. The sand remembers."

**`src/motion/`** (built-in `Animated`, native driver)

- `useReducedMotion()` (AccessibilityInfo + listener).
- `FadeInView`: screen entrance.
- `AnimatedTrace`: SVG path draw-on via `strokeDashoffset`, used on design cards and the job progress
  view; the ball follows the path tip.
- `PulseRing`: the scanner frame and the "paired" indicator.
- `CompletionBloom`: a soft sand-ripple on result success.
- Each one renders its final state immediately when reduced motion is on.

**Share** On the result screen, a `Share.share` with an EN/AR message, the design name and the
tagline.

Use the `frontend-design` or `impeccable` skill for the visual pass. The direction is heritage,
calm, sand and light, not neon.

### Verification

- Jest: with reduced motion on, every motion component renders the final frame immediately (no
  running animation); the share button calls `Share.share` with the localized message.
- `theme.spec.ts` contrast tests pass.
- A screen recording or screenshots from the emulator of scan → table → drawing progress → completion
  in EN and AR.

### Anti-pattern guards

No new animation dependency. No animation on the JS thread where the native driver works. No
looping animation without a stop on unmount.

---

## Phase 9: Verify and document

**How this serves the primary goal:** this phase proves the whole promise holds, on the simulator, in
both languages, with only owners drawing.

### What to implement and check

- `pnpm check` passes. CI passes on the branch.
- A new e2e test in `apps/api/test/owned-journey.e2e.spec.ts`. It runs: admin creates customer +
  table → customer activates → pairs → table offline blocks start → online → draws a design →
  draws a path (personalized) → sets an ambience → rakes → logs out → old token refused.
- Run the `backend-design:security-reviewer` agent and the `ecc:security-reviewer` agent on the
  auth, sessions, admin and pairing code. Fix every confirmed high finding.
- Anti-pattern greps from Phase 0, all empty.
- Docs:
  - `docs/architecture.md`: accounts, sessions, ownership, pairing, entitlements, rake/path/ambience.
  - `docs/api-conventions.md`: auth header, new error codes.
  - `docs/environment-configuration.md`: new data files; `ADMIN_API_KEY` removed.
  - `docs/development-setup.md`: `admin:create` and the first-customer walkthrough.
  - `docs/testing.md`: the manual run.

## Not now

- Real hardware driver and proof of presence for pairing.
- Postgres and multiple API instances.
- Email or SMS delivery and self-service password reset.
- Payments and quotes (the website's quote form).
- Landmark designs (Grand Mosque, Burj Khalifa…), which need artwork from the owner.
- The last 3 LED ambience names.
- Auto-rake after every drawing.
- Playlists and scheduling.
- Household members or guests on someone else's table.
- Image share cards.
- Push and live updates (polling stays).
- Haptics.
