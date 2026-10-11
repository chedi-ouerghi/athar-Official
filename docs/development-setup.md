# Development setup

## Prerequisites

| Tool        | Version  | Check                                  |
| ----------- | -------- | -------------------------------------- |
| Node.js     | >= 20.19 | `node --version`                       |
| pnpm        | >= 10.12 | `pnpm --version`                       |
| JDK         | 17       | `java -version`                        |
| Android SDK | any      | `adb --version` (Android only)         |
| Xcode       | current  | `xcodebuild -version` (iOS/macOS only) |

Install pnpm through Corepack so the version pinned in `packageManager` is used:

```bash
corepack enable
```

## Install

From the repository root:

```bash
pnpm install
```

This also compiles `@athar/contracts` (its `prepare` script), which both
applications consume. After editing files in `packages/contracts`, rebuild it:

```bash
pnpm --filter @athar/contracts build
```

## Environment files

```bash
cp apps/api/.env.example    apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Both examples contain safe, non-secret defaults and work as-is for a local
development machine. See
[environment-configuration.md](environment-configuration.md) for the full
variable list and for addressing the API from a physical device.

## Run both applications

```bash
pnpm dev
```

This runs the API (`http://localhost:3000`) and the Expo dev server
(`http://localhost:8081`) together, shutting both down when either stops.

## Run the API alone

```bash
pnpm dev:api
```

`apps/api` runs `tsc --watch` alongside `node --watch`, so editing a source file
rebuilds and restarts the service automatically.

Verify it:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

Production-style run, using the compiled output:

```bash
pnpm --filter @athar/api build
pnpm --filter @athar/api start
```

## Run the mobile app alone

```bash
pnpm dev:mobile
```

Then choose a target from the Expo CLI, or launch one directly:

```bash
pnpm --filter @athar/mobile android
pnpm --filter @athar/mobile ios
```

`--android` boots an emulator and installs Expo Go on it if missing.

### Reaching the API from each target

| Target                      | Base URL to use                               |
| --------------------------- | --------------------------------------------- |
| Android emulator            | `http://10.0.2.2:3000` (default, no config)   |
| iOS simulator               | `http://localhost:3000` (default, no config)  |
| Physical device (Expo Go)   | `http://<your-LAN-IP>:3000` — **must be set** |
| Physical device (dev build) | `http://<your-LAN-IP>:3000` — **must be set** |

For a physical device, find the host address and set it in `apps/mobile/.env`:

```bash
# macOS / Linux
ip route get 1.1.1.1 | awk '{print $7}'

# Windows PowerShell
(Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' }).IPAddress
```

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000
```

Restart the dev server afterwards: `EXPO_PUBLIC_*` values are inlined into the
bundle when it is built.

## Development Builds

Expo Go is sufficient until a native module that Expo Go does not bundle is
required. The table link no longer needs one: the table connects to the backend,
not to the phone (see
[future-infrastructure-decisions.md](future-infrastructure-decisions.md)), so no
BLE or serial module is planned. Any other such native dependency moves the
project to a Development Build:

```bash
cd apps/mobile
pnpm exec eas build --profile development --platform android
```

`apps/mobile/eas.json` already defines the `development`, `preview` and
`production` profiles. On Android, a development build that talks to a local
HTTP API also needs cleartext traffic enabled through `expo-build-properties`
(see [future-infrastructure-decisions.md](future-infrastructure-decisions.md)).

## Quality gates

```bash
pnpm check
```

Runs formatting, linting, type checking and the full test suite. Run it before
every push.

## Troubleshooting

**`ELIFECYCLE prepare` during `pnpm install`.** `@athar/contracts` failed to
compile. Run `pnpm --filter @athar/contracts build` to see the error.

**Metro: `Unable to resolve module <name>`.** The bundler is not resolving a
transitive dependency. Confirm `apps/mobile/metro.config.js` still sets
`watchFolders` to the workspace root and does **not** set
`resolver.disableHierarchicalLookup` — see
[architecture.md](architecture.md#monorepo-mechanics).

**The app shows `Unreachable`.** Expected when the API is stopped. Check the
address rendered on the screen against the table above, and confirm the API is
listening on `0.0.0.0` rather than `127.0.0.1` (`HOST` in `apps/api/.env`).

**`Unable to resolve ...` for a brand-new package.** The app must be started
after `pnpm install`, because Metro caches its resolution graph.

**Port already in use.** Change `PORT` in `apps/api/.env` and
`EXPO_PUBLIC_API_PORT` in `apps/mobile/.env` together; the derived mobile base
URL follows the port.
