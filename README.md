# ATHAR

Infrastructure foundation for ATHAR: an Expo mobile application and a NestJS
backend, in a single pnpm workspace.

This repository currently contains **no product features**. Its purpose is to
provide a reproducible, verifiable base on which the product can be built
without re-litigating tooling, networking or configuration.

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
pnpm dev              # runs the API and the Expo dev server together
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
The startup screen shows the resolved API address and whether the backend
answered its liveness probe. It renders and stays usable when the backend is
offline.

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

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Run API and mobile dev servers together        |
| `pnpm dev:api`      | Run only the API (watch mode)                  |
| `pnpm dev:mobile`   | Run only the Expo dev server                   |
| `pnpm build`        | Type-check and build every package             |
| `pnpm typecheck`    | Type-check every package                       |
| `pnpm lint`         | Lint every package                             |
| `pnpm lint:fix`     | Lint and apply auto-fixes                      |
| `pnpm format`       | Format the repository with Prettier            |
| `pnpm format:check` | Verify formatting without writing              |
| `pnpm test`         | Run all unit and HTTP integration tests        |
| `pnpm check`        | `format:check` + `lint` + `typecheck` + `test` |
| `pnpm clean`        | Remove build output                            |

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

| Document                                                                           | Contents                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                       | Module boundaries, dependency rules, request/response flow    |
| [docs/development-setup.md](docs/development-setup.md)                             | Prerequisites and per-platform startup instructions           |
| [docs/environment-configuration.md](docs/environment-configuration.md)             | Every environment variable and the device-address matrix      |
| [docs/api-conventions.md](docs/api-conventions.md)                                 | Routing, versioning, validation and the error contract        |
| [docs/testing.md](docs/testing.md)                                                 | Test layers, how to run them, what is deliberately not tested |
| [docs/future-infrastructure-decisions.md](docs/future-infrastructure-decisions.md) | Deferred dependencies and the triggers for adding them        |

## Scope

Explicitly **out of scope** at this stage, and intentionally absent: product
features, hardware drivers (BLE/Wi-Fi/serial), authentication, payments,
databases, caches, queues, Docker, and CI/CD. Each is listed in
[docs/future-infrastructure-decisions.md](docs/future-infrastructure-decisions.md)
together with the requirement that would justify introducing it.
