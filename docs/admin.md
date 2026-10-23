# The admin page

`apps/admin/index.html` is the back-office of ATHAR: one HTML file, plain JavaScript, no build
and no framework. It talks to the API with `fetch` and a Bearer token that lives in memory only
(closing or reloading the tab signs you out).

A beginner can use it, without help, to: create a customer, create a table for that customer, get the
table's id, its pairing QR code and its broker login, and see whether the table is online.

## Open it

The API does **not** serve this page. Serve the folder with any static server, **from your own
computer**, and open it on `localhost`:

```bash
cd apps/admin
python3 -m http.server 8080        # on Windows: python -m http.server 8080
```

Then open <http://localhost:8080/index.html>. Do **not** double-click the file (`file://`): the API
refuses pages without a real origin.

Why `localhost`: with `NODE_ENV=development` (the on-site test setup,
[`deploy/docker-compose.local.yml`](../deploy/docker-compose.local.yml)) the API accepts calls from any
`http://localhost:<port>` page. In production the API accepts only the origins listed in
`CORS_ORIGINS` (see [`apps/api/.env.example`](../apps/api/.env.example)).

On the sign-in screen, type:

- **Where is the API?** The API address. On the Raspberry Pi test setup it is
  `http://<Pi address>:3000` (for example `http://athar-pi.local:3000`; the Pi's address is the output
  of `hostname -I` on the Pi). On your own machine: `http://localhost:3000`.
- **Admin email** and **Password**: an account made with `admin:create` (see the
  [hardware guide](../hardware/GUIDE-EQUIPE-DUBAI.md), step C4).

An account that is not an admin is refused.

## What you see

| Section      | What it is for                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------- |
| How it works | The four steps, in order                                                                           |
| 1. Customers | Create customers; give a new activation code; disable a customer                                   |
| 2. Tables    | List, search, create (**Provision a table**), see the state, configure, enable/disable, pairing QR |

The **Online?** column is read every 10 seconds while the page is open (and when you press
**Refresh now**). It shows:

| Badge           | Meaning                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| Online          | The table controller is connected to the broker                                    |
| Online, drawing | Connected and drawing right now                                                    |
| Offline         | Not connected: no power or network, no broker account, wrong username, or no agent |
| Error           | The table reported an error                                                        |
| Unknown         | The state could not be read (press **Refresh now**)                                |

The state comes from `GET /api/v1/tables/:id`, which an admin may call for any table.

## Journeys, step by step

### 1. Create a customer

1. In **1. Customers**, type the customer's email and name, press **Create customer**.
2. A window shows the **activation code**. Press **Copy** and give it to the customer. It is shown only
   once; if it is lost, use **New activation code** on the customer's row (this signs the customer out
   everywhere and asks for confirmation).

An empty list says: "No customers yet. Create the first one with the form above."

### 2. Create a table (provision it)

Needs at least one customer who is not disabled; otherwise the page says "Create a customer first".

1. In **2. Tables**, press **Provision a table**.
2. Choose the **customer** (the only account that will be able to pair this table), then name, location,
   plan and shape and size. The picture shows the table to scale.
3. Press **Provision table**. A window opens with three blocks. **Copy what you need now**: the broker
   password and the pairing link are shown only once and are not stored.
   - **A. The table**: the **table id**. It is also the table's broker username.
   - **B. Broker login for the table controller**: username, password, and the broker address and port, with
     the exact commands to register the table on the broker.
   - **C. Pairing QR code** for that customer, and its link.

The broker address shown is the one the **API** uses. For a local setup that is `mosquitto:1883` (the name
inside Docker); the controller on the Pi itself connects to `127.0.0.1` with the same port.

### 3. Register the table on the broker, and check it is online

Creating a table does **not** create its broker account. Run, on the Pi, the commands from block B (they are
the ones of the [hardware guide](../hardware/GUIDE-EQUIPE-DUBAI.md), step D2): type the password
shown in block B when asked. Then, in the table list, the **Online?** badge becomes **Online** as soon as the
table controller (the agent, `apps/table-agent`) publishes `online`. To test without an agent, see step D3 of the guide.

If the badge stays **Offline**, press **Details** on the table: it explains the likely causes.

### 4. Give the customer the pairing QR code

1. Press **Pairing QR** on the table's row (disabled once the table has an owner).
2. Show or print the QR code, or copy the **pairing link**. Only the customer chosen at provisioning can use it.
3. A table made before codes were tied to a customer (for example with the `table:create` command) has no
   customer yet: the page first asks you to **choose the customer**.

Pressing **Pairing QR** again for a table that is already reserved issues a **new** code; the previous one stops
working (the page asks you to confirm). The QR image is drawn by a small library loaded from the internet; offline, the
page tells you so and the **pairing link** below it still works.

### 5. See details of a table

**Details** shows the table id, its state with an explanation, where it is, its owner, and the broker commands again.
The broker **password is never shown again**: the API does not store it. If it is lost, choose a new one with the
commands shown and give it to the table controller.

### 6. Change a table

**Configure** edits name, location, plan, voice assistant and shape and size, and saves.

### 7. Disable and enable a table

**Disable** asks for confirmation ("Nobody can start a drawing on it until you enable it again") and then
marks the table **Disabled**; **Enable** switches it back at once.

### 8. Disable a customer

On the customer's row, **Disable** asks for confirmation and ends the customer's sessions.

## Messages

Errors appear in red at the top of the page in plain words, with the API's code in brackets for support, for
example "Wrong email or password. (INVALID_CREDENTIALS)". "Cannot reach the API at …" lists the three usual causes:
the API is not running, the address is wrong, or the page was not opened from `http://localhost:<port>`.

## Limits

- The broker password of a table cannot be shown again or regenerated from the page; that would need a new API
  endpoint (today `provision` generates the password but nothing stores or registers it).
- No fine-grained roles (every admin can do everything) and no audit log.
- No automated tests for this page (it has no build). It was checked in a browser against the local test stack:
  sign-in, empty states, creating a customer, provisioning a table, copy blocks, the **Online?** column changing
  when a table publishes `online`, the confirmation before disabling a table, the details window, and the error messages.
  Not checked: other browsers, a phone screen, and the QR image (it needs the internet library).

## API calls used

`POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `GET` and `POST /admin/customers`,
`POST /admin/customers/:id/reset-access`, `POST /admin/customers/:id/disable`, `GET /admin/tables`,
`POST /admin/tables/provision`, `PATCH /admin/tables/:id`, `POST /admin/tables/:id/claim-token`,
and `GET /tables/:id` for the **Online?** column. All under `/api/v1`.
