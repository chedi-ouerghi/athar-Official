# ATHAR

ATHAR: an Expo mobile application and a NestJS backend, in a single pnpm
workspace. A visitor scans the QR code on a sand table, browses four designs,
starts a drawing, watches it progress, and can pause, resume or stop it. The table
is **simulated**: no hardware driver exists yet, and the app says "Simulation" on
every screen that shows a table or a drawing.

## Status

Verified on an Android emulator against a real API process (details and what was
**not** observed in [docs/testing.md](docs/testing.md#verified-manually)): open a table,
browse the four designs, start, pause, resume, complete and draw again; stop with
confirmation; an injected fault; an unknown table; a disabled table; a second start
while busy; the API stopped and restarted mid-drawing. English and Arabic are
implemented. Not yet verified: scanning a QR code with the camera, a physical phone,
iOS, and the Arabic layout on a device. Nothing is deployed; see
[docs/deployment.md](docs/deployment.md).

## Requirements

| Tool    | Version  | Notes                                                 |
| ------- | -------- | ----------------------------------------------------- |
| Node.js | >= 20.19 | `engines` in the root `package.json` is authoritative |
| pnpm    | >= 10.12 | Declared via `packageManager`                         |

For the Android workflow you additionally need the Android SDK, a JDK 17
toolchain and at least one emulator image. Expo Go is enough for day-to-day
development; a Development Build is required only once a native module that
Expo Go does not bundle is added. The table connects to the backend over the
network, not to the phone, so no BLE or serial module is planned — see
[docs/future-infrastructure-decisions.md](docs/future-infrastructure-decisions.md).

## Getting started

```bash
pnpm install          # also builds @athar/contracts
pnpm dev              # API + contracts watcher + Expo dev server together
```

To run one side at a time:

```bash
pnpm dev:api          # NestJS on http://localhost:3000
pnpm dev:mobile       # Expo dev server on http://localhost:8081
```

Then verify the foundation:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

Open the app on an Android emulator with `pnpm --filter @athar/mobile android`.
To try the whole journey (provision a table, make its QR code, scan it), follow
[docs/development-setup.md](docs/development-setup.md#try-it-in-expo-go-on-a-phone).
The "Connection details" link on the home screen shows the resolved API address,
whether the backend answers, and its table mode.

## Workspace layout

```
apps/
  mobile/      Expo (React Native) application
  api/         NestJS backend
packages/
  contracts/   Shared Zod schemas and transport types
  config/      Shared ESLint and Prettier configuration
docs/
```

## Commands

Run from the repository root.

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Run API, contracts watcher and Expo together     |
| `pnpm dev:api`      | Run the API (watch mode) and contracts watcher   |
| `pnpm dev:mobile`   | Run only the Expo dev server                     |
| `pnpm build`        | Type-check and build every package               |
| `pnpm typecheck`    | Type-check every package                         |
| `pnpm lint`         | Lint every package                               |
| `pnpm lint:fix`     | Lint and apply auto-fixes                        |
| `pnpm format`       | Format the repository with Prettier              |
| `pnpm format:check` | Verify formatting without writing                |
| `pnpm test`         | Run every package's tests, one package at a time |
| `pnpm check`        | `format:check` + `lint` + `typecheck` + `test`   |
| `pnpm clean`        | Remove build output                              |

Tables are provisioned with `pnpm --filter @athar/api table:create` and `table:qr`;
see [docs/development-setup.md](docs/development-setup.md#provision-a-table).

`pnpm check` is the single command to run before pushing.

## Environment

Copy the example files; they contain only safe, non-secret defaults.

```bash
cp apps/api/.env.example    apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

The API refuses to start if a variable is missing or invalid, and lists every
problem at once. The mobile app derives a platform-appropriate backend address
when none is configured. Full details, including how to point a **physical
device** at a development machine, are in
[docs/environment-configuration.md](docs/environment-configuration.md).

## Documentation

| Document                                                                           | Contents                                                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                       | Module boundaries, dependency rules, request/response flow |
| [docs/development-setup.md](docs/development-setup.md)                             | Prerequisites and per-platform startup instructions        |
| [docs/environment-configuration.md](docs/environment-configuration.md)             | Every environment variable and the device-address matrix   |
| [docs/api-conventions.md](docs/api-conventions.md)                                 | Routing, versioning, validation and the error contract     |
| [docs/testing.md](docs/testing.md)                                                 | Test layers, how to run them, what was verified by hand    |
| [docs/deployment.md](docs/deployment.md)                                           | Production start, variables, storage, hosts, EAS profiles  |
| [docs/future-infrastructure-decisions.md](docs/future-infrastructure-decisions.md) | Deferred dependencies and the triggers for adding them     |

## Scope

Explicitly **out of scope** for now, and intentionally absent: hardware drivers
(the table connects to the backend over the network, not to the phone),
authentication and access control on the public endpoints, payments, a database
(tables live in a JSON file, drawings in memory, so the API runs as a single
instance), Docker, CI/CD and rate limiting. Each is listed in
[docs/future-infrastructure-decisions.md](docs/future-infrastructure-decisions.md)
together with the requirement that would justify introducing it, and the open
product decisions are in [docs/architecture.md](docs/architecture.md#9-open-decisions).
