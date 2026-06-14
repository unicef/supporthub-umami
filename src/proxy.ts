import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { blockGlobalRoutes } from '@/lib/supporthub-routes';

/**
 * SupportHub fork — DEV proxy. Next 16 uses `proxy.ts` (not `middleware.ts`).
 * In the Docker/production image this file is replaced by `docker/proxy.ts`
 * (COPY docker/proxy.ts ./src), which runs the same `blockGlobalRoutes` guard
 * alongside umami's tracker/CORS/login handling.
 */
export const config = {
  // Skip API routes, Next internals, and any file with an extension.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

export default function proxy(req: NextRequest) {
  return blockGlobalRoutes(req) ?? NextResponse.next();
}
