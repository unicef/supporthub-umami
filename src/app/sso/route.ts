import { secret } from '@/lib/crypto';
import { createSecureToken, parseToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { getUser } from '@/queries/prisma/user';

// Strict allowlist: /websites/<uuid> or exactly /
const DEST_RE =
  /^\/websites\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\/$/;

function deny(msg: string): Response {
  return new Response(msg, { status: 403 });
}

export async function GET(request: Request): Promise<Response> {
  const ssoSecret = process.env.UMAMI_SSO_SECRET;
  if (!ssoSecret || Buffer.byteLength(ssoSecret, 'utf8') < 32) {
    return deny('SSO not configured');
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const dest = url.searchParams.get('dest') ?? '/';

  if (!token) {
    return deny('Missing token');
  }

  // Validate dest before doing any DB work
  if (!DEST_RE.test(dest)) {
    return deny('Invalid destination');
  }

  // Verify handoff JWT (HMAC HS256; jwt.verify checks exp automatically)
  const payload = parseToken(token, ssoSecret) as Record<string, unknown> | null;
  if (!payload || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
    return deny('Invalid token');
  }

  const { sub: userId, jti, exp } = payload as { sub: string; jti: string; exp: number };

  // GC expired JTIs (fire-and-forget — don't await to keep latency low)
  void prisma.client.$executeRaw`DELETE FROM sso_handoff_jti WHERE expires_at < now()`;

  // Single-use redeem: INSERT the jti; ON CONFLICT means already used
  const inserted: number = await prisma.client.$executeRaw`
    INSERT INTO sso_handoff_jti (jti, expires_at)
    VALUES (${jti}, to_timestamp(${exp}))
    ON CONFLICT (jti) DO NOTHING
  `;
  if (inserted === 0) {
    return deny('Token already used');
  }

  // Verify user exists
  const user = await getUser(userId);
  if (!user) {
    return deny('User not found');
  }

  // Mint umami session token — role pinned to 'user' regardless of JWT claim
  const sessionToken = createSecureToken({ userId, role: 'user' }, secret());

  // AUTH_TOKEN constant is 'umami.auth' (from src/lib/constants.ts)
  // setClientAuthToken(token) calls setItem(AUTH_TOKEN, token) which does JSON.stringify.
  // We replicate that exactly in the inline script to avoid bug C1 (JSON.parse → Bearer null).
  // The token is embedded as a JS string literal; JSON.stringify runs IN THE
  // BROWSER so localStorage holds the JSON-encoded form (`"<token>"`) — exactly
  // what setClientAuthToken writes and getClientAuthToken's JSON.parse expects.
  // Interpolating JSON.stringify(token) directly would store the RAW token,
  // breaking getClientAuthToken (JSON.parse throws → Bearer null → /login). [C1]
  const tokenLiteral = JSON.stringify(sessionToken);
  const destJson = JSON.stringify(dest);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Signing in…</title>
</head>
<body>
<script>
(function(){
try{localStorage.setItem('umami.auth',JSON.stringify(${tokenLiteral}));}catch(e){}
location.replace(${destJson});
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  });
}
