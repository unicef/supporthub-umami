# SupportHub Fork Notes

This file documents implementation details that other SupportHub components need to
know when integrating with this umami fork.

## Branch

`supporthub-fork` off `master@c0ea3aefb`

---

## Handoff JWT Claim Shape

Both `/sso` and `/api/provision` consume JWTs signed with **HMAC HS256** using the
`UMAMI_SSO_SECRET` environment variable.

### Provision JWT (`POST /api/provision` body `{ "token": "<jwt>" }`)

```json
{
  "tenantRef":  "<opaque unique string identifying the SupportHub tenant>",
  "tenantName": "<human-readable name for the team and website>",
  "domain":     "<public domain of the tenant site>",
  "admins": [
    { "remoteId": "<SupportHub admin user ID>", "displayName": "<optional display name>" }
  ],
  "exp":  1234567890,
  "jti":  "<uuid — unique per call>"
}
```

* `admins` must be a non-empty array; each entry must have a non-empty `remoteId` string.
* `/api/provision` is **idempotent**: re-sending the same `tenantRef` / `remoteId`s with a
  fresh JWT (new `jti`) returns the same IDs without creating duplicates.
* Roles are **pinned server-side**: global `'user'`, team `'team-member'`. Never pass
  a role claim in the JWT.

**Response:**
```json
{
  "teamId":       "<uuid>",
  "websiteId":    "<uuid>",
  "adminUserIds": {
    "<remoteId>": "<umamiUserId>"
  }
}
```

`adminUserIds` is a map from each `remoteId` in the request to its umami user UUID.
SupportHub must persist this map so it can generate SSO JWTs per-admin.

### SSO JWT (`GET /sso?token=<jwt>&dest=<path>`)

```json
{
  "sub":  "<umamiUserId — one specific admin's userId from adminUserIds>",
  "exp":  1234567890,
  "jti":  "<uuid — unique per redirect>"
}
```

* `dest` is a **query string parameter**, NOT a JWT claim.
* `dest` allowlist (enforced server-side): `^/websites/<uuid>$` or exactly `/`.
* `exp` should be short-lived (≤ 60 s from issue time).
* Mints session token via `createSecureToken({ userId, role: 'user' }, secret())`.

---

## Environment Variables

| Name               | Purpose                                         |
|--------------------|-------------------------------------------------|
| `UMAMI_SSO_SECRET` | Shared HMAC signing secret (min 32 bytes UTF-8) |
| `DISABLE_LOGIN`    | Set to any truthy value to block login UI and `POST /api/auth/login` (SSO-only deployments) |

---

## Script.js Beacon Mechanism

umami's tracking script (`/script.js`) sends event beacons via **`fetch()`** (see
`src/tracker/index.js` line 175). It does **not** use `navigator.sendBeacon` or an
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
token)` → `JSON.stringify(data)`). Writing the raw token without `JSON.stringify`
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

---

## Provisioning User Keying

Each SupportHub admin gets their own umami user, keyed by `remoteId`:

| Field     | Value                                         |
|-----------|-----------------------------------------------|
| `username`| `admin:<remoteId>` (truncated to 255 chars)   |
| `role`    | `'user'` (pinned server-side)                 |
| `password`| cryptographically random, locked (not usable) |

Team membership role: `'team-member'` (pinned server-side).

---

## Docker / Local Dev

Repo root has a `Dockerfile` and `docker-compose.yml`. The compose file uses the
upstream image by default; override with a `docker-compose.override.yml` to build
the fork locally:

```yaml
services:
  umami:
    build: .
    image: umami-supporthub-fork:local
    environment:
      DATABASE_URL: postgresql://umami:umami@db:5432/umami
      APP_SECRET: <random>
      UMAMI_SSO_SECRET: <shared-secret-min-32-bytes>
      DISABLE_LOGIN: "1"
```

Port: `3000`. `UMAMI_URL=http://localhost:3000` for SupportHub config.
