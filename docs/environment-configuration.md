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

| Variable              | Type    | Default       | Purpose                                                      |
| --------------------- | ------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`            | enum    | `development` | `development`, `test` or `production`                        |
| `HOST`                | string  | `0.0.0.0`     | Interface the HTTP server binds to                           |
| `PORT`                | integer | `3000`        | TCP port                                                     |
| `LOG_LEVEL`           | enum    | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `SHUTDOWN_TIMEOUT_MS` | integer | `10000`       | Grace period for in-flight requests on `SIGINT`/`SIGTERM`    |

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

| Variable                     | Type    | Default   | Purpose                                             |
| ---------------------------- | ------- | --------- | --------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`   | URL     | _(unset)_ | Full origin of the API, e.g. `http://10.1.2.3:3000` |
| `EXPO_PUBLIC_API_PORT`       | integer | `3000`    | Port used to derive the default base URL            |
| `EXPO_PUBLIC_API_TIMEOUT_MS` | integer | `10000`   | Network timeout applied to every request            |

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
