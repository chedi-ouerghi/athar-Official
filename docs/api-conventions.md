# API conventions

These rules are enforced by the code in `apps/api`, not merely documented. The
HTTP integration test in `apps/api/test/api.e2e.spec.ts` asserts the parts that
matter most.

## Routing and versioning

```
GET  /health          liveness probe   (unversioned)
GET  /ready           readiness probe  (unversioned)
/api/v1/**            versioned API
```

Probes sit outside the global prefix because orchestrators, load balancers and
uptime monitors address them by a fixed path; those paths must not move when
the API version does.

Business endpoints live under the global prefix (`api`) with URI versioning and
`defaultVersion: '1'`. A new controller is versioned automatically — there is
nothing to remember.

Path matching is exact. Requests that match no route return the standard error
envelope, whether or not they fall inside or outside `/api`.

## Validation

Validate at the boundary, before anything else runs. The service uses Zod
through a single pipe:

```ts
import { z } from 'zod';

const createDeviceSchema = z.object({
  name: z.string().min(2),
  serial: z.string().regex(/^ATH-\d{4}$/),
});

@Post()
create(@Body(new ZodValidationPipe(createDeviceSchema)) body: CreateDevice) {}
```

Consequences:

- Handlers receive the **parsed** value: coerced and stripped of unknown keys.
- Unknown keys are removed, so a client cannot smuggle extra fields through.
- A failure raises `ValidationFailedException`, which the exception filter maps
  to `400 VALIDATION_FAILED` with one detail per offending field.

The pipe is not registered globally on purpose: an endpoint with no schema
should be a deliberate, visible decision rather than an implicit absence of
validation.

## Success responses

Respond with the plain object. Do not wrap it in an envelope — the error shape
is already unambiguous, and a wrapper would make every success path noisier
without adding safety.

## Error responses

Every non-2xx response uses exactly one shape, defined in
`@athar/contracts` as `apiErrorResponseSchema`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "details": [{ "path": "body.serial", "message": "Serial must look like ATH-0001" }],
    "requestId": "b1f2c0de-0d0a-4a5b-9c1a-6f0f5f0a1b2c",
    "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

| Field       | Presence        | Notes                                                          |
| ----------- | --------------- | -------------------------------------------------------------- |
| `code`      | always          | Stable, machine-readable; clients may branch on it             |
| `message`   | always          | Human-readable; safe to show, never contains internals         |
| `details`   | validation only | Per-field failures, path prefixed with `body`/`query`/`params` |
| `requestId` | always          | Matches the server log entry                                   |
| `timestamp` | always          | ISO-8601 UTC                                                   |

Codes: `BAD_REQUEST`, `NOT_FOUND`, `VALIDATION_FAILED`, `INTERNAL_SERVER_ERROR`,
`SERVICE_UNAVAILABLE`. These are part of the public contract — renaming one is a
breaking change. Domain codes (`TABLE_NOT_FOUND`, `TABLE_BUSY`, `UNAUTHORIZED`
and others) are added additively in `@athar/contracts`; see
[architecture.md](architecture.md#error-codes) for the current list.

`ApiExceptionFilter` maps every exception to this envelope, including
framework-generated ones: an unknown route, and a malformed JSON body. It also
handles errors that never reached the Nest exception layer (body-parser
failures), so those are not reported as server faults.

**Internal errors never leak.** An unexpected exception is logged with its stack
and answered with `An unexpected error occurred.` A raw message can embed file
paths or connection strings.

## Correlation ids

Send `x-request-id` to correlate a client-side failure with a server log entry.
The value is echoed in the error body and attached to the log line. If it is
absent, the service generates one. Inbound ids are length-bounded so an
oversized header cannot bloat every log line.

## Readiness vs liveness

- `GET /health` answers as long as the process can serve a request. It performs
  no dependency checks, so a dependency outage never causes a restart loop.
- `GET /ready` runs the probes and returns `503` when any of them fails, so an
  orchestrator can take the instance out of rotation without parsing the body.

Each probe reports only its **name** and outcome. Timing and resolved values
stay in the logs, so the endpoint cannot be used to fingerprint the deployment.

When a dependency is introduced, its probe is added to
`HealthService.getReadiness()` — that single function is the only place a new
dependency becomes readiness-relevant.

## Logging

- Newline-delimited JSON outside development; `pino-pretty` inside it.
- `service` and `serviceVersion` on every line.
- `authorization`, `cookie` and `x-request-id` header values are redacted by
  pino itself, so they cannot leak through a custom serialiser.
- Health probes are excluded from automatic request logging.
- Use the injected Nest logger rather than `console`, which the lint rules
  forbid.

## Request limits

JSON bodies are capped at 100 kB. The API exchanges small control-plane
payloads; anything much larger is a client mistake and is rejected early rather
than buffered.

## Versioning policy

`v1` is committed to the following: the probe paths, the error envelope, and the
meaning of each error code. Additive changes (new endpoints, new optional
fields) do not bump the version. A breaking change introduces `v2` alongside
`v1`, and both are served until clients have migrated.
