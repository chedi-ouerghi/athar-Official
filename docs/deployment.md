# Deployment

Nothing has been deployed to a server. **Current plan: everything is installed and tested on
site, on a Raspberry Pi** (API and broker in Docker, the phone on the same Wi-Fi); see
[hardware/GUIDE-EQUIPE-DUBAI.md](../hardware/GUIDE-EQUIPE-DUBAI.md). The Google Cloud VM below
is paused, not removed, and comes later. The Raspberry Pi program that bridges the broker and
the board (`apps/table-agent`) is not written yet. This document says how to deploy, what was
checked on a development machine, and what is still open. Commands marked **(verified)** were run
for this document; everything else is instruction, not evidence.

The product is two independent pieces (architecture.md, "Deployment"): the **API**,
a Node process, and the **mobile app**, built by EAS. They meet only at the API's
public HTTPS address and at `@athar/contracts`.

## API

### Start command

The API runs on Node alone (>= 20.19). Build the API and the one package it depends
on, then start the compiled output **(verified, from a clean checkout, started from
the repository root)**:

```bash
pnpm install --frozen-lockfile
pnpm --filter "@athar/api..." build     # contracts, then the API. Does not build the mobile app
pnpm --filter @athar/api start          # node dist/main.js
# equivalent, from the repository root:   node apps/api/dist/main.js
```

`pnpm build` (everything) also works but needlessly bundles the mobile app. The
`dev` scripts are for development only: they restart on file changes, and a restart
forgets every running drawing.

The process needs no build tools at run time and no database. It stops cleanly on
`SIGTERM`/`SIGINT` (in-flight requests finish; after `SHUTDOWN_TIMEOUT_MS` it exits
anyway).

### Environment variables

Validated once at start; the process refuses to start and lists every problem **(verified:
`NODE_ENV=production` with no key and no link base printed both and exited)**.

| Variable                         | Production value                    | Notes                                                                                                                                                                             |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                       | `production`                        | Turns on the checks below and JSON logs                                                                                                                                           |
| `PORT`                           | what the host assigns               | Most hosts inject it. Default `3000`                                                                                                                                              |
| `HOST`                           | `0.0.0.0` (default)                 | Must be reachable by the host's router                                                                                                                                            |
| `ACCOUNTS_DATA_FILE`             | a path **on persistent storage**    | Accounts (password hashes). Same rules as `TABLES_DATA_FILE`. Create the first admin with `admin:create` on the host, before the first start                                      |
| `TABLE_ACCESS_DATA_FILE`         | a path **on persistent storage**    | Claim and share token hashes, and guests. Same rules as `TABLES_DATA_FILE`; losing it invalidates printed claim codes                                                             |
| `SESSIONS_DATA_FILE`             | a path **on persistent storage**    | Sessions (token hashes). Same rules as `TABLES_DATA_FILE`                                                                                                                         |
| `TRUST_PROXY`                    | `1` behind one reverse proxy        | Behind Caddy, or a host's single load balancer, set `TRUST_PROXY=1` so the sign-in limit sees client IPs, not the proxy's (check the host's hop count). Leave unset with no proxy |
| `PUBLIC_LINK_BASE_URL`           | **required**, `https://<link host>` | Origin only (no path). It is baked into every printed QR code, so it must outlive the products (decision 3)                                                                       |
| `TABLES_DATA_FILE`               | a path **on persistent storage**    | Default `./data/tables.json` is relative to the working directory and is lost on an ephemeral disk                                                                                |
| `TABLE_MODE`                     | `simulation`                        | `hardware` uses the MQTT driver (see the MQTT variables below)                                                                                                                    |
| `MQTT_URL`                       | `mqtts://<broker host>:8883`        | Hardware only. Required to be `mqtts://` or `wss://` in production                                                                                                                |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | the API's login on the broker       | Hardware only. Both required in production                                                                                                                                        |
| `LOG_LEVEL`                      | `info`                              |                                                                                                                                                                                   |
| `SHUTDOWN_TIMEOUT_MS`            | `10000` (default)                   | Keep it below the host's own kill timeout                                                                                                                                         |
| `JOB_HISTORY_LIMIT`              | `20` (default)                      | Jobs kept per table, in memory                                                                                                                                                    |
| `SIMULATION_SPEED_FACTOR`        | `1`                                 | Real pace. Raise only for demos                                                                                                                                                   |
| `SIMULATION_FAULT_EVERY_NTH_JOB` | `0`                                 | Faults off. They exist to test the error path                                                                                                                                     |
| `SIMULATION_FAULT_AT_PROGRESS`   | default                             | Ignored while faults are off                                                                                                                                                      |

### Persistent storage and a single instance

- `TABLES_DATA_FILE` holds the registered tables. A printed QR code points at an id in
  that file, so losing it orphans every code in the world. Put it on a **mounted volume**,
  set the variable to an absolute path inside it, and back the volume up. The file and
  its directory are created if missing **(verified: a nested path that did not exist)**.
- **Run exactly one instance.** The file is safe for one writing process; the API takes a
  `<file>.lock` and a second process on the same file refuses to start with a message
  naming the first **(verified by accident: a leftover process held the lock and the new
  one refused)**. Jobs are in memory, so a second instance would also not share running
  drawings.
- A deploy must therefore **stop the old instance before starting the new one** (no
  overlapping "rolling" start), and every deploy or restart **forgets running drawings**;
  the app shows "This drawing is no longer available" **(verified on the emulator)**. A
  lock left by a crashed process is taken over automatically.
- Tables are registered after the first start, with the admin endpoint, since the
  `table:create` command needs shell access to the volume and refuses while the API runs.
  `TOKEN` is an admin access token from `POST /api/v1/auth/login` (development-setup.md,
  "Admin account"); create that admin with `admin:create` before the first start:

  ```bash
  curl -X POST https://<api host>/api/v1/admin/tables \
    -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
    -d '{"displayName": "Main hall", "location": "Ground floor"}'
  curl https://<api host>/api/v1/admin/tables/<id>/qr -H "Authorization: Bearer $TOKEN"
  ```

  The answer's `link` (`https://<link host>/t/<id>`) is what the printed code holds; render
  it with `pnpm --filter @athar/api table:qr <id>` on a machine that has the table file
  (or encode the link with any QR tool at error-correction level Q).

### Hardware mode (MQTT)

With `TABLE_MODE=hardware` the API drives real tables through an MQTT broker
(Mosquitto) that you run next to it; see
[architecture.md](architecture.md#mqtttabledriver) for the protocol.

- The API starts even if the broker is unreachable; every table then reads
  `offline` and commands fail with `TABLE_OFFLINE` until it comes back.
- Run the broker with TLS (`mqtts://`, port 8883), anonymous access off, and an
  ACL: each table's login may read only `athar/v1/t/<its id>/cmd` and write only
  its own `ack`, `status` and `presence`; the API's login may read every table's
  `ack`, `status` and `presence` and write every `cmd`. Never expose a port on a
  venue's network: tables connect out.
- A command is never queued: if a table is not known to be online, it is refused
  at once rather than held and sent later. A table that does not acknowledge a
  command within 5 seconds is reported offline.
- The broker credentials in `provisionTableResponse` are placeholders until the
  broker's Dynamic Security plugin is wired in: they are generated but not yet
  registered on the broker.

### Probes

`GET /health` (process is alive) and `GET /ready` (200 when ready, 503 otherwise; also
reports `tableMode`). Point the host's health check at `/ready`, or at `/health` if a
restart loop on a failing dependency is not wanted.

### Test stack on one GCP VM (paused)

`deploy/` holds a Docker Compose stack (Caddy for HTTPS, the API, Mosquitto over
`wss://`) for a single free-tier VM, and `.github/workflows/deploy-api.yml` rebuilds
and redeploys the API. The workflow is **manual** (`workflow_dispatch`) until the VM exists;
its header says how to bring back the automatic deploy on each push to `master`. Setup, step
by step: [deploy/README.md](../deploy/README.md).

### On-site test stack (Raspberry Pi)

`deploy/docker-compose.local.yml` is an override of the stack above: no Caddy, the API image built
on the Pi (arm64), plain MQTT on port 1883, `NODE_ENV=development` (the only mode that accepts a broker
without TLS). Run it with `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d`
from `deploy/`. Step by step: [hardware/GUIDE-EQUIPE-DUBAI.md](../hardware/GUIDE-EQUIPE-DUBAI.md);
what each test level must show: [hardware/TESTING.md](../hardware/TESTING.md). The admin page is
described in [admin.md](admin.md).

### Choosing a host

What the API needs from a host: run a Node process, keep **one** instance, give it a
**persistent volume**, terminate HTTPS, inject `PORT` and secrets. No database. The
table below is from general knowledge of these products, not from using them for this
project, and **plans, prices and limits change: check each vendor's current page before
deciding.**

|                      | Render                                                                                                          | Railway                                   | Fly.io                                                              | Plain VPS (any provider)                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Build from this repo | Build and start commands, no Docker needed                                                                      | Detects Node; commands configurable       | Needs a container image (`apps/api/Dockerfile`)                     | You run the build yourself                                  |
| Persistent volume    | "Persistent disk", only on paid instance types                                                                  | Volumes attach to a service               | Volumes, tied to one machine in one region                          | The server's own disk                                       |
| Single instance fit  | A service with a disk cannot scale out, and redeploys stop the old instance first, which is what the lock wants | One replica with a volume                 | Run exactly one machine; a second one gets its own, separate volume | One process; trivially single                               |
| HTTPS and domain     | Automatic                                                                                                       | Automatic                                 | Automatic                                                           | You set up a reverse proxy (e.g. Caddy) and `TRUST_PROXY=1` |
| Operating effort     | Low                                                                                                             | Low                                       | Medium (container, CLI)                                             | Highest (OS updates, process manager, backups)              |
| Main drawback here   | Disk costs a paid plan; brief downtime per deploy                                                               | Volume plus single replica; check regions | Dockerfile to maintain; volume bound to one machine                 | You own everything                                          |

A reasonable first choice is **Render or Railway**: least work, and both fit "one
instance, one volume". Fly.io is attractive if multi-region later matters, but the JSON
file does not scale out regardless. Whatever is chosen, **PostgreSQL is the planned
replacement for the JSON file** (decision 19) and removes the single-instance rule.

## Mobile app

### Build profiles (`apps/mobile/eas.json`)

| Profile       | Output           | API address                                           | Link hosts | Plain-http API |
| ------------- | ---------------- | ----------------------------------------------------- | ---------- | -------------- |
| `development` | dev-client APK   | `http://10.0.2.2:3000` (emulator; change for a phone) | none       | **allowed**    |
| `preview`     | internal APK     | `https://api-staging.athar.example` placeholder       | empty      | refused        |
| `production`  | store app bundle | `https://api.athar.example` placeholder               | empty      | refused        |

The values for `preview` and `production` are **placeholders on purpose**: the domain
is not decided (decision 3). They are public values, set per profile in `eas.json`
(`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_TABLE_LINK_HOSTS`, `EXPO_PUBLIC_POLL_INTERVAL_MS`);
change them there, or override them with EAS environment variables, when the domain exists.

**A build with a placeholder is refused.** `app.config.ts` runs
`release-check.cjs` for the `preview` and `production` profiles and stops with a list
of what is wrong if the API address is missing, plain `http`, a placeholder
(`.example`, `.test`, `.invalid`, `.localhost`) or a local/private address
(`localhost`, `10.x`, `192.168.x`, `172.16-31.x`, `10.0.2.2`), or if a link host is a
placeholder or local **(verified: `EAS_BUILD_PROFILE=production` with the placeholder in
`eas.json` was refused with a readable message; a real `https://api.athar.app` passed;
unit-tested)**. So `eas build --profile production` fails until the real values are set,
which is the point.

### Android cleartext traffic

Android blocks plain-http traffic by default. `app.config.ts` enables it **only when
`EAS_BUILD_PROFILE=development`** (through `expo-build-properties`) **(verified:
`usesCleartextTraffic` is `true` for `development`, `false` for `production` and when no
profile is set)**. `preview` builds are https-only, so a preview APK needs an https
staging API. Expo Go, which is not a build of this app, is unaffected.

### No secret in the bundle

Only `EXPO_PUBLIC_*` variables reach the bundle, and they are public by definition. The
app has no reference to admin routes. **Verified** by exporting the
Android bundle with real-looking values and a development API key present in the
environment, then searching the JavaScript: the configured API address and link host
were present (so environment inlining works in a built app), and the former admin key
setting and value, `api/v1/admin`, `Bearer `, `PUBLIC_LINK_BASE_URL` and `TABLES_DATA_FILE` were
absent. Repeat this before a release; it takes a minute:

```bash
cd apps/mobile
EXPO_PUBLIC_API_BASE_URL=https://<real api> npx expo export --platform android --no-bytecode --output-dir /tmp/athar-export
grep -c -F "api/v1/admin" /tmp/athar-export/_expo/static/js/android/*.js   # expect 0
```

### Link hosts, QR codes and store builds

- HTTPS links open the app only when a real host is set in `EXPO_PUBLIC_TABLE_LINK_HOSTS`
  (which becomes iOS associated domains and Android `autoVerify` intent filters), the
  host serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`,
  and the installed build is one that carries them. They never work in Expo Go. Without
  a host, only the in-app scanner and typed codes open a table.
- Printed codes must use the production `PUBLIC_LINK_BASE_URL`. A code printed against a
  staging host is wrong forever.
- The "install the app" page that the link falls back to when the app is missing is
  **not built** (architecture.md, "Install page").
- iOS builds also need an Apple developer account, a bundle identifier and the camera
  usage text translated if Arabic App Store copy is wanted; Android needs a signing
  key managed by EAS. None of this was attempted.

## Before the first real deployment

1. Decide the domain (decision 3) and set `PUBLIC_LINK_BASE_URL`, the API address and
   the link host from it.
2. Choose the host; create the volume; set `TABLES_DATA_FILE`, `ACCOUNTS_DATA_FILE`, `SESSIONS_DATA_FILE`,
   `PUBLIC_LINK_BASE_URL`, `NODE_ENV=production` as secrets/variables.
3. Replace the placeholders in `eas.json`; build `preview`; install it on a real phone
   against the staging API and walk the journey (testing.md, "Verified manually").
4. Host the verification files and the install page if HTTPS links are wanted.
5. Decide access control and rate limiting (decisions 2 and 21): the public endpoints
   are open, and the API has no rate limiting.
6. Back up the tables volume, and write down how to restore it.
