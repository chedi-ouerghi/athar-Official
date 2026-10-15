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

This also compiles `@athar/contracts` (its `prepare` script). The compiled
`dist/` is what the **production** API runs and what `pnpm build` produces;
day-to-day work does not need you to rebuild it by hand:

| Consumer                     | Reads contracts from | After you edit `packages/contracts/src`                  |
| ---------------------------- | -------------------- | -------------------------------------------------------- |
| Type checking (API, mobile)  | source               | Seen immediately                                         |
| API tests, mobile tests      | source               | Seen immediately                                         |
| Metro (the app)              | source               | Seen on the next reload                                  |
| `pnpm dev` / `pnpm dev:api`  | `dist/`, kept fresh  | The contracts watcher rebuilds `dist/`, the API restarts |
| `pnpm build`, production run | `dist/`              | `pnpm build` rebuilds contracts first                    |

The API cannot run TypeScript directly on Node 20, which is why its dev server
reads `dist/`; `pnpm dev:api` runs the contracts watcher next to it for that
reason. If you run the API some other way after changing contracts, rebuild with
`pnpm --filter @athar/contracts build`.

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

This runs three things together, with their output interleaved and prefixed:

- the API (`http://localhost:3000`), built once and then watched;
- the `@athar/contracts` watcher (`tsc --watch`), which keeps `dist/` current
  for the API;
- the Expo dev server (`http://localhost:8081`).

Stopping it (Ctrl+C) stops all three. If a port is taken, set `PORT` for the
API (`PORT=3100 pnpm dev`) and `RCT_METRO_PORT` for Metro; keep the app's
`EXPO_PUBLIC_API_PORT` or `EXPO_PUBLIC_API_BASE_URL` in step with `PORT`.
The Expo dev server runs without a terminal UI here, so its interactive keys
(`a`, `r`, ...) are unavailable; use `pnpm dev:mobile` in a second terminal
for those.

## Run the API alone

```bash
pnpm dev:api
```

This also starts the contracts watcher. `apps/api` first builds once, so a clean
checkout (no `dist/`) works, then runs `tsc --watch` alongside
`node --watch`: editing a source file, in the API or in `packages/contracts`,
rebuilds and restarts the service automatically. Logs are pretty-printed in
development.

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

Restart the dev server afterwards, **clearing the bundler cache**:
`EXPO_PUBLIC_*` values are inlined into the bundle when a file is transformed,
and Metro reuses cached transforms, so a changed value can otherwise appear to
be ignored.

```bash
pnpm dev:mobile --clear
```

`apps/mobile/src/config/env.ts` must keep reading each variable as a literal
`process.env.EXPO_PUBLIC_NAME`. Expo only inlines that exact syntax; reading
them through an object or a loop silently yields `undefined` in a built app.

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

## Provision a table

A table must be registered before its QR code or screen can work. Each table gets a
server-generated, random id.

```bash
# register a table (the API must not be running: see below)
pnpm --filter @athar/api table:create --name "Main hall" --location "Ground floor"

# write the QR code for it: apps/api/qr-codes/<id>.svg and .png
pnpm --filter @athar/api table:qr <id>
```

For a code that a phone's camera can scan, set `PUBLIC_LINK_BASE_URL` in
`apps/api/.env` first; without it the code holds a development link
(`athar://t/<id>`) that only opens the app. Registered tables live in
`apps/api/data/tables.json`, which is git-ignored.

`table:create` writes the tables file, and only one process may write it, so it
refuses while the API is running (it says so). To register tables while the API
is up, use the admin endpoint with an admin session.

## Admin account

Admin routes need an admin account. Create one with the API stopped (the command
writes `apps/api/data/accounts.json` and takes its lock, like `table:create`). It
prompts twice for the password (14 to 200 characters), hidden; it never takes it
as an argument. Use `--password-stdin` to pipe it in instead.

```bash
pnpm --filter @athar/api admin:create --email you@example.com --name "Your name"
```

Then, with the API running, sign in and use the access token (it lasts 15 minutes;
refresh it at `POST /api/v1/auth/refresh` or sign in again):

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"<your password>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -X POST http://localhost:3000/api/v1/admin/tables \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"displayName": "Main hall", "location": "Ground floor"}'
```

`table:qr` only reads and is safe to run any time. If the API is killed rather than
stopped, it leaves a lock file behind; the next start or command detects that the
process is gone and carries on.

## Try a drawing

With the API running (`pnpm dev:api`), the simulated table can be driven by hand. A
drawing takes minutes at real speed; `SIMULATION_SPEED_FACTOR=20 pnpm dev:api` makes
it twenty times faster. Get an admin `TOKEN` first ([Admin account](#admin-account)).

```bash
curl -s -X POST localhost:3000/api/v1/admin/tables -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"displayName":"Demo","location":"Desk"}'   # note the id
curl -s localhost:3000/api/v1/tables/<id>
curl -s localhost:3000/api/v1/designs
curl -s -X POST localhost:3000/api/v1/tables/<id>/jobs -H 'content-type: application/json' \
  -d '{"designId":"star","clientRequestId":"'$(node -e "console.log(crypto.randomUUID())")'"}'
curl -s localhost:3000/api/v1/jobs/<jobId>        # poll it: progress rises, then "completed"
curl -s -X POST localhost:3000/api/v1/jobs/<jobId>/pause   # or /resume, /stop
```

Jobs live in memory and disappear whenever the API restarts, and in `pnpm dev:api`
the API restarts every time you save a source file (or a contracts file), so a drawing
in progress is lost on each save. That is expected in development.

Starting `pnpm dev:api` does **not** restart it. Both packages build incrementally
(`dist/.tsbuildinfo`), so the watchers that start after the first build find nothing
to rewrite. Without that, the watcher's first full emit made `node --watch` restart a
few seconds after the first healthy response, which silently dropped any job started
in that window.

## Try it in Expo Go on a phone

1. **Network.** Put the phone and the computer on the same Wi-Fi. Find the computer's
   LAN address (`ipconfig` on Windows; use the IPv4 address of the Wi-Fi adapter).
   Allow Node through the Windows firewall for private networks if asked.
2. **API.** For quick drawings set `SIMULATION_SPEED_FACTOR=20` in `apps/api/.env`. Optionally
   `SIMULATION_FAULT_EVERY_NTH_JOB=3` to see a failed drawing. Start it with
   `pnpm dev:api` (it listens on `0.0.0.0:3000`).
3. **Register a table, then stop the API** (`table:create` refuses while it runs), or
   use the admin endpoint with `curl` while it runs:

   ```bash
   pnpm --filter @athar/api table:create --name "Main hall" --location "Ground floor"
   pnpm --filter @athar/api table:qr <id>     # writes apps/api/qr-codes/<id>.svg and .png
   ```

   With no `PUBLIC_LINK_BASE_URL` the code holds `athar://t/<id>`, which the in-app
   scanner reads (Expo Go itself cannot open it from the phone's camera app). Open the
   PNG or SVG on the computer screen. Start the API again.

4. **App.** Create `apps/mobile/.env` with
   `EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:3000`, then `pnpm dev:mobile`, and
   scan the Expo QR code with Expo Go (Android) or the Camera app (iOS).
5. **Use it.** Home, then "Scan your table", allow the camera, point it at the QR
   code on the computer screen. Or "Enter table code" and type the id.

If the app says it cannot connect, open Home, then "Connection details": it shows
the address the app is using and whether the API answers.

## Look at the designs

```bash
pnpm --filter @athar/api designs:svg
```

writes `apps/api/design-previews/<slug>.svg` for each of the four designs and
`contact-sheet.svg` with all of them. Open them in a browser. The pictures follow
the curve the table would draw, with the table's rim, and a green dot at the
centre where every design starts and ends. The folder is git-ignored.
[designs.md](designs.md) explains each design.

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
