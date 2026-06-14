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
 * Shared by the dev proxy (`src/proxy.ts`) and the Docker proxy
 * (`docker/proxy.ts`, which replaces src/proxy.ts in the production image).
 */
const BLOCKED = /^(?:\/teams\/[^/]+)?\/(?:boards|links|pixels|dashboard|console)(?:\/|$)/;

export function blockGlobalRoutes(req: NextRequest): NextResponse | undefined {
  if (BLOCKED.test(req.nextUrl.pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return undefined;
}
