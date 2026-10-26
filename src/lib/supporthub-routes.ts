import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * SupportHub fork: tenant admins SSO directly into their own website and are
 * scoped to it. The global umami feature areas — custom boards/dashboards, the
 * link shortener, tracking pixels, and the SQL console — are hidden from the
 * nav; this blocks them by direct URL too (defense-in-depth).
 *
 * Top-level and `/teams/<teamId>/...` prefixed variants redirect to `/`, which
 * lands the user back on their own team's website. Allowed: the website
 * analytics, `/settings`, and `/admin` (already role-gated).
 *
 * Personal API keys are blocked too: a key is a credential that does not go
 * through SupportHub SSO and outlives a revoked hub login. The settings page
 * redirects to `/`; the API answers 404.
 *
 * Shared by the dev proxy (`src/proxy.ts`) and the Docker proxy
 * (`docker/proxy.ts`, which replaces src/proxy.ts in the production image).
 */
const BLOCKED =
  /^(?:\/teams\/[^/]+)?\/(?:boards|links|pixels|dashboard|console|settings\/api-keys)(?:\/|$)/;
const BLOCKED_API = /^\/api\/me\/api-keys(?:\/|$)/;

export function blockGlobalRoutes(req: NextRequest): NextResponse | undefined {
  if (BLOCKED_API.test(req.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  if (BLOCKED.test(req.nextUrl.pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return undefined;
}
