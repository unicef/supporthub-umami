# SupportHub Fork Notes

This file documents implementation details that other SupportHub components need to
know when integrating with this umami fork.

## Branch

`supporthub-fork` off `master@c0ea3aefb`

---

## Handoff JWT Claim Shape

Both `/sso` and `/api/provision` consume JWTs signed with **HMAC HS256** using the
`UMAMI_SSO_SECRET` environment variable.

### SSO JWT (`GET /sso?token=<jwt>&dest=<path>`)

```json
{
  "sub":  "<umami userId returned by /api/provision>",
  "dest": "/websites/<uuid>",
  "exp":  1234567890,
  "jti":  "<uuid – unique per token>"
}
```

* `dest` must match `^/websites/<uuid>$` or be exactly `/`.
* `exp` should be short-lived (≤ 60 s from issue time).

### Provision JWT (`POST /api/provision` body `{ "token": "<jwt>" }`)

```json
{
  "tenantRef":  "<opaque unique string identifying the SupportHub tenant>",
  "tenantName": "<human-readable name for the team and website>",
  "domain":     "<public domain of the tenant site>",
  "exp":        1234567890,
  "jti":        "<uuid – unique per token>"
}
```

* `/api/provision` is idempotent: re-sending the same `tenantRef` with a fresh JWT
  (new `jti`) will return the same `{teamId, websiteId, userId}` without creating
  duplicates.
* Roles are **pinned server-side** (`role: 'user'` globally, `role: 'team-member'`
  in the team). Never pass a role in the JWT.

---

## Environment Variable

| Name               | Purpose                                        |
|--------------------|------------------------------------------------|
| `UMAMI_SSO_SECRET` | Shared HMAC signing secret (min 32 bytes UTF-8)|
| `DISABLE_LOGIN`    | Set to any truthy value to block the login UI and `POST /api/auth/login` (use in SSO-only deployments) |

---

## Script.js Beacon Mechanism

umami's tracking script (`/script.js`) sends event beacons via **`fetch()`** (see
`src/tracker/index.js` line 175).  It does **not** use `navigator.sendBeacon` or an
image pixel.

**CSP implication for SupportHub public pages:**

```
Content-Security-Policy: connect-src 'self' https://<umami-host>;
```

You do **not** need `img-src` for tracking. You **do** need `connect-src` pointing at
the umami host.

---

## SSO Auth-Token Storage

`/sso` mints a session token via `createSecureToken({userId, role:'user'}, secret())`
and stores it with:

```js
localStorage.setItem('umami.auth', JSON.stringify(token));
```

This replicates `setClientAuthToken(token)` exactly (which calls `setItem(AUTH_TOKEN,
token)` → `JSON.stringify(data)`).  Writing the raw token without `JSON.stringify`
would break `getClientAuthToken()`'s `JSON.parse` step, producing `Bearer null`
(bug C1).

---

## Single-Use JTI Table

```sql
-- src: prisma/migrations/20_supporthub_sso/migration.sql
CREATE TABLE sso_handoff_jti (
  jti        TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
```

JTIs are redeemed with `INSERT … ON CONFLICT DO NOTHING` (atomic). A background GC
`DELETE … WHERE expires_at < now()` fires on each request (fire-and-forget).

No Redis dependency.
