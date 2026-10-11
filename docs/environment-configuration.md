# Environment configuration

No secret is stored in this repository. Both applications ship example files
containing safe, non-secret defaults:

```bash
cp apps/api/.env.example    apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Real environment variables always take precedence over `.env` files, so a
deployment can inject configuration without shipping files.

## Precedence

1. Real environment variables (what your host, container or CI injects).
2. `apps/api/.env.local` — developer overrides, git-ignored.
3. `apps/api/.env` — shared local defaults, git-ignored.

`.env` and `.env.local` are both ignored by Git. Only `.env.example` is
committed, which is what makes the full variable list discoverable from a clean
clone.

## API variables

Defined and validated in `apps/api/src/config/environment.schema.ts`. The
process **refuses to start** if any value is missing or invalid, and reports
every problem at once.

| Variable                         | Type         | Default       | Purpose                                                                 |
| -------------------------------- | ------------ | ------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`                       | enum         | `development` | `development`, `test` or `production`                                   |
| `HOST`                           | string       | `0.0.0.0`     | Interface the HTTP server binds to                                      |
| `PORT`                           | integer      | `3000`        | TCP port                                                                |
| `LOG_LEVEL`                      | enum         | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`            |
| `SHUTDOWN_TIMEOUT_MS`            | integer      | `10000`       | Grace period for in-flight requests on `SIGINT`/`SIGTERM`               |
| `TABLE_MODE`                     | enum         | `simulation`  | `simulation` or `hardware`; `hardware` refuses to start (below)         |
| `SIMULATION_SPEED_FACTOR`        | number > 0   | `1`           | Divides simulated drawing durations (`10`: a 10-minute drawing takes 1) |
| `SIMULATION_FAULT_EVERY_NTH_JOB` | integer >= 0 | `0`           | Every Nth simulated job faults; `0` never                               |
| `JOB_HISTORY_LIMIT`              | integer >= 1 | `20`          | Drawing jobs remembered per table (below)                               |
| `SIMULATION_FAULT_AT_PROGRESS`   | number 0..1  | `0.6`         | Progress at which an injected fault occurs                              |

### Tables, admin access and QR links

| Variable               | Default              | Purpose                                                              |
| ---------------------- | -------------------- | -------------------------------------------------------------------- |
| `TABLES_DATA_FILE`     | `./data/tables.json` | JSON file that stores the registered tables                          |
| `ADMIN_API_KEY`        | _(unset)_            | Secret for `/api/v1/admin/**`, sent as `Authorization: Bearer <key>` |
| `PUBLIC_LINK_BASE_URL` | _(unset)_            | Origin used to build the link in each table's QR code                |

**`TABLES_DATA_FILE`.** Relative paths are resolved from the directory the API
runs in (`apps/api` under `pnpm`). The file and its directory are created on
first start. It holds registration data only (no secrets, no personal data) and
must be on **persistent storage** in a real deployment. Only one process may write
it: the API holds `<file>.lock` while it runs, and the `table:create` command
refuses to run while the API does. A corrupt or unknown-version file stops the API
from starting, with a message naming the file, and is never overwritten. The file
and `./qr-codes` are git-ignored.

**`ADMIN_API_KEY`.** In **production** the API refuses to start if it is missing,
shorter than 32 characters, or still the placeholder from `.env.example`. In
development and test it is optional, and when unset the admin endpoints **refuse
every request** (they fail closed). Generate one with, for example,
`openssl rand -base64 48` or
`node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`.
It is compared in constant time, accepted only in the `Authorization` header, and
redacted from logs. It belongs to the server: never put it in the mobile app, in
an `EXPO_PUBLIC_*` variable, or in a QR code. There is one shared key with no
identity and no audit trail, and rotating it means restarting the API with a new
value (see open decision 18 in [architecture.md](architecture.md)).

**`PUBLIC_LINK_BASE_URL`.** An origin such as `https://app.athar.example`: no path,
query or credentials; a trailing slash is ignored. Required in production, where
it must be `https`. Unset in development, QR links use `athar://t/<tableId>`,
which opens the app but cannot be scanned by a phone's camera app. The domain is
baked into every printed code, so choose one that will outlive the products.

**`JOB_HISTORY_LIMIT`** (default `20`, at least `1`). Drawing jobs remembered per
table, newest first. When a table has more, its oldest _finished_ jobs are
forgotten, and their idempotency entries with them, so a request id whose job is
gone makes a new job again. A running job is never forgotten. Jobs are held in
memory and are all lost when the API restarts; the app treats `JOB_NOT_FOUND` for a
job it knew as a normal state.

### Table mode

`TABLE_MODE` selects the table driver. `simulation` (the default) drives a
simulated table. `hardware` is a valid value but **the API refuses to start
with it**, because no hardware driver exists yet:

```
TABLE_MODE=hardware is not available: no hardware table driver is installed in this build.
Set TABLE_MODE=simulation.
```

The refusal happens while the application is being assembled, before any port
is bound, and exits with a non-zero code. The `SIMULATION_*` variables are read
only by the simulator and have no effect otherwise. They exist so demos and
manual testing can speed drawings up (`SIMULATION_SPEED_FACTOR=20`) and so the
error path can be exercised on demand
(`SIMULATION_FAULT_EVERY_NTH_JOB=2 SIMULATION_FAULT_AT_PROGRESS=0.5`).

### Why `HOST` defaults to `0.0.0.0`

Binding to `127.0.0.1` makes the API unreachable from an Android emulator and
from any physical device on the network. Bind to all interfaces for local
development; restrict it deliberately in a real deployment.

### Logging

`NODE_ENV=development` routes logs through `pino-pretty` for readability. Any
other value emits newline-delimited JSON, which is what log shippers expect.
`pino-pretty` is a dev dependency and is never loaded in a production install.

## Mobile variables

Read and validated in `apps/mobile/src/config/env.ts`.

| Variable                       | Type                  | Default   | Purpose                                                             |
| ------------------------------ | --------------------- | --------- | ------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`     | URL                   | _(unset)_ | Full origin of the API, e.g. `http://10.1.2.3:3000`                 |
| `EXPO_PUBLIC_API_PORT`         | integer               | `3000`    | Port used to derive the default base URL                            |
| `EXPO_PUBLIC_API_TIMEOUT_MS`   | integer               | `10000`   | Network timeout applied to every request                            |
| `EXPO_PUBLIC_TABLE_LINK_HOSTS` | comma-separated hosts | _(empty)_ | HTTPS hosts accepted in a table link; empty accepts only `athar://` |
| `EXPO_PUBLIC_POLL_INTERVAL_MS` | integer >= 250        | `1000`    | How often the progress screen asks for the running job              |

`EXPO_PUBLIC_TABLE_LINK_HOSTS` takes bare host names (`app.athar.example`, no
scheme, port or path), compared case-insensitively with the host of a link. It is
read in two places that must agree: the app's link parser, and `app.config.ts`,
which turns each host into an iOS associated domain and an Android `autoVerify`
intent filter. Leave it empty until the domain is decided (architecture.md, open
decision 3). Even once set, HTTPS links open the app only in a build that carries
those settings and only if the host serves `/.well-known/apple-app-site-association`
and `/.well-known/assetlinks.json`; they never work in Expo Go, which does not register
either the `athar://` scheme or any domain.

### `EXPO_PUBLIC_` means public

Any variable prefixed with `EXPO_PUBLIC_` is **inlined into the JavaScript
bundle** at build time. It is readable by anyone who has the app.

Therefore: never place an API key, a database credential, a device token or any
other server-side secret in this file or in `apps/mobile/app.config.ts`. If the
mobile app needs a credential to talk to the API, that credential must be
issued to it at runtime by the backend, not compiled in.

The API must likewise never trust an `EXPO_PUBLIC_*` value received from a
client. These variables configure the app, not the request.

### Choosing the base URL

There is no single "localhost". The correct address depends on where the code
runs, so the app resolves it per platform:

| Where the app runs | Address                     | How it is obtained     |
| ------------------ | --------------------------- | ---------------------- |
| Android emulator   | `http://10.0.2.2:3000`      | Derived automatically  |
| iOS simulator      | `http://localhost:3000`     | Derived automatically  |
| Web                | `http://localhost:3000`     | Derived automatically  |
| Physical device    | `http://<host-LAN-IP>:3000` | **Must be configured** |

`10.0.2.2` is the Android emulator's alias for the host machine's loopback
interface. Inside the emulator, `127.0.0.1` is the emulator itself, which is why
`localhost` is never used as a universal answer.

An unset or blank `EXPO_PUBLIC_API_BASE_URL` is treated as "not configured" and
falls back to the platform default. An **invalid** value is a startup error, not
a silent fallback — a typo should be visible immediately.

The startup screen displays both the resolved address and whether it came from
configuration or from a platform default.

### Matching the port

`EXPO_PUBLIC_API_PORT` only affects the _derived_ default. When
`EXPO_PUBLIC_API_BASE_URL` is set, it wins outright, and the two must be kept
consistent by hand (or simply set the port once in the base URL).

## Health endpoints expose nothing

`GET /health` and `GET /ready` return only a status, the service name, the
service version, a timestamp, process uptime, and the names of the probes that
ran. They never return environment variables, host names, ports, log levels,
dependency connection strings or any other infrastructure detail. An integration
test asserts the exact field set to keep it that way.

## Secrets management

There are no secrets to manage yet — the API has no credentials. When one is
introduced, the rule is:

- never commit it, and never place it in an `.env.example`;
- inject it as a real environment variable at runtime;
- add it to the redaction list in `apps/api/src/logging/create-logger.module.ts`
  if it can appear in a log line;
- keep it out of the mobile bundle entirely.
