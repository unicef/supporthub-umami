import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * SupportHub fork: tenant admins SSO directly into their own website and are
 * scoped to it. The global umami feature areas — custom boards/dashboards, the
 * link shortener, tracking pixels, and the SQL console — are hidden from the
 * nav (SideNav/TopNav); this also blocks them by direct URL as defense-in-depth.
 *
 * Allowed (NOT blocked): the website analytics itself (`/websites`,
 * `/websites/[id]`, `/teams/[id]/websites/...`), the user's own `/settings`,
 * and `/admin` (already role-gated to umami admins, which SSO users are not).
 *
 * Blocked routes (top-level and the `/teams/[teamId]/...` prefixed variants)
 * redirect to `/`, which lands the user back on their own team's website.
 */
const BLOCKED = /^(?:\/teams\/[^/]+)?\/(?:boards|links|pixels|dashboard|console)(?:\/|$)/;

export function middleware(req: NextRequest) {
  if (BLOCKED.test(req.nextUrl.pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on page navigations only — skip API routes, Next internals, and any
  // request for a file with an extension (assets, /script.js, etc.).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
