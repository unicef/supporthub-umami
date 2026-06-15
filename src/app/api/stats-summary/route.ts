import { getCompareDate } from '@/lib/date';
import { parseToken } from '@/lib/jwt';
import { getQueryFilters } from '@/lib/request';
import { json } from '@/lib/response';
import { getActiveVisitors, getPageviewMetrics, getWebsiteStats } from '@/queries/sql';

/**
 * SupportHub stats summary endpoint.
 *
 * Server-to-server companion to `/api/provision`: SupportHub's admin
 * "Analytics" card fetches a compact dashboard summary for a single website
 * here, authenticated with a short-lived HMAC handoff JWT (HS256, signed with
 * `UMAMI_SSO_SECRET`) rather than a umami session token — this deployment is
 * SSO-only (`/api/auth/login` disabled), so no Bearer token is mintable
 * outside the fork.
 *
 * The `websiteId` to report on comes from the JWT claim, NOT the request body,
 * so a caller can only read the site the signer authorised. The endpoint is
 * read-only; replay is harmless (the data is the tenant's own and the token
 * expires in ≤60s), so unlike `/api/provision` it does not consume a
 * single-use JTI — that lets SupportHub retry safely.
 *
 * Token claims: { websiteId, startAt, endAt, exp, jti? } where startAt/endAt
 * are epoch-millisecond numbers.
 *
 * Response: {
 *   stats:        { pageviews, visitors, visits, bounces, totaltime },
 *   comparison:   { pageviews, visitors, visits, bounces, totaltime }, // previous period
 *   topPages:     [{ x: url, y: count }],
 *   topReferrers: [{ x: domain, y: count }],
 *   active:       number  // visitors in the last 5 minutes
 * }
 */

// Simple in-memory rate limiter: max 60 requests / minute per IP (mirrors
// /api/provision; higher cap because the card may refresh on range toggle).
const rlMap = new Map<string, number[]>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 60;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const times = (rlMap.get(ip) ?? []).filter(t => now - t < RL_WINDOW_MS);
  times.push(now);
  rlMap.set(ip, times);
  return times.length <= RL_MAX;
}

function deny(msg: string, status = 403): Response {
  return Response.json({ error: { message: msg, status } }, { status });
}

const TOP_LIMIT = 5;

export async function POST(request: Request): Promise<Response> {
  // FAIL CLOSED: secret must be configured and >= 32 bytes.
  const ssoSecret = process.env.UMAMI_SSO_SECRET;
  if (!ssoSecret || Buffer.byteLength(ssoSecret, 'utf8') < 32) {
    return deny('Stats summary not configured', 503);
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return deny('Rate limit exceeded', 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return deny('Invalid JSON', 400);
  }

  const { token } = body ?? {};
  if (typeof token !== 'string') {
    return deny('Missing token', 400);
  }

  // Verify handoff JWT (HMAC HS256; jwt.verify checks exp automatically).
  const payload = parseToken(token, ssoSecret) as Record<string, unknown> | null;

  if (
    !payload ||
    typeof payload.websiteId !== 'string' ||
    !payload.websiteId ||
    typeof payload.startAt !== 'number' ||
    typeof payload.endAt !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    return deny('Invalid token');
  }

  const websiteId = payload.websiteId as string;
  const startAt = payload.startAt as number;
  const endAt = payload.endAt as number;

  if (!(endAt > startAt)) {
    return deny('Invalid date range', 400);
  }

  // Build the same filter shape the standard stats/metrics routes use. The
  // permission check is intentionally skipped: authorisation is the signed
  // JWT, which pins the websiteId.
  const filters = await getQueryFilters({ startAt, endAt, timezone: 'UTC' }, websiteId);

  const stats = await getWebsiteStats(websiteId, filters);

  const { startDate, endDate } = getCompareDate('prev', filters.startDate, filters.endDate);
  const comparison = await getWebsiteStats(websiteId, {
    ...filters,
    startDate,
    endDate,
  });

  const topPages = await getPageviewMetrics(
    websiteId,
    { type: 'path', limit: TOP_LIMIT, offset: 0 },
    filters,
  );

  const topReferrers = await getPageviewMetrics(
    websiteId,
    { type: 'referrer', limit: TOP_LIMIT, offset: 0 },
    filters,
  );

  const active = await getActiveVisitors(websiteId);

  return json({
    stats,
    comparison,
    topPages,
    topReferrers,
    active: active?.visitors ?? 0,
  });
}
