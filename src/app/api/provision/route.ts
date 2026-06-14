import crypto from 'node:crypto';
import { ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { parseToken } from '@/lib/jwt';
import { hashPassword } from '@/lib/password';
import prisma from '@/lib/prisma';
import { getTeamUser } from '@/queries/prisma/teamUser';
import { getUserByUsername } from '@/queries/prisma/user';

// Stable seeded admin user from prisma/migrations/01_init/migration.sql:199
const SEEDED_ADMIN_ID = '41e2b680-648e-4b09-bcd7-3e2b10c06264';

// Simple in-memory rate limiter: max 20 requests / minute per IP
const rlMap = new Map<string, number[]>();
const RL_WINDOW_MS = 60_000;
const RL_MAX = 20;

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

interface AdminEntry {
  remoteId: string;
  displayName?: string;
}

export async function POST(request: Request): Promise<Response> {
  // FAIL CLOSED: secret must be configured and >= 32 bytes
  const ssoSecret = process.env.UMAMI_SSO_SECRET;
  if (!ssoSecret || Buffer.byteLength(ssoSecret, 'utf8') < 32) {
    return deny('Provisioning not configured', 503);
  }

  // Rate limit by IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return deny('Rate limit exceeded', 429);
  }

  // Parse body
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

  // Verify handoff JWT (HMAC HS256; jwt.verify checks exp automatically)
  const payload = parseToken(token, ssoSecret) as Record<string, unknown> | null;

  if (
    !payload ||
    typeof payload.tenantRef !== 'string' ||
    typeof payload.tenantName !== 'string' ||
    typeof payload.domain !== 'string' ||
    typeof payload.jti !== 'string' ||
    typeof payload.exp !== 'number' ||
    !Array.isArray(payload.admins) ||
    payload.admins.length === 0
  ) {
    return deny('Invalid token');
  }

  // Validate admins array: each entry must have a non-empty remoteId string
  const admins = payload.admins as unknown[];
  const validAdmins: AdminEntry[] = [];
  for (const entry of admins) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).remoteId !== 'string' ||
      !(entry as Record<string, unknown>).remoteId
    ) {
      return deny('Invalid admins entry', 400);
    }
    const { remoteId, displayName } = entry as Record<string, unknown>;
    validAdmins.push({
      remoteId: remoteId as string,
      displayName: typeof displayName === 'string' ? displayName : undefined,
    });
  }

  const tenantRef = payload.tenantRef as string;
  const tenantName = payload.tenantName as string;
  const domain = payload.domain as string;
  const jti = payload.jti as string;
  const exp = payload.exp as number;

  // GC expired JTIs (fire-and-forget)
  void prisma.client.$executeRaw`DELETE FROM sso_handoff_jti WHERE expires_at < now()`;

  // Single-use redeem: 0 rows affected means jti already exists → replay
  const inserted: number = await prisma.client.$executeRaw`
    INSERT INTO sso_handoff_jti (jti, expires_at)
    VALUES (${jti}, to_timestamp(${exp}))
    ON CONFLICT (jti) DO NOTHING
  `;
  if (inserted === 0) {
    return deny('Token already used');
  }

  // ----------------------------------------------------------------
  // Idempotent ensure: team → website → (per-admin: user + membership)
  // ----------------------------------------------------------------

  // 1. Team — keyed on externalRef (tenantRef)
  let teamId: string;
  const existingTeam = await prisma.client.team.findUnique({
    where: { externalRef: tenantRef },
    select: { id: true },
  });
  if (existingTeam) {
    teamId = existingTeam.id;
  } else {
    teamId = uuid();
    await prisma.transaction([
      prisma.client.team.create({
        data: {
          id: teamId,
          name: tenantName.slice(0, 50),
          accessCode: `team_${crypto.randomBytes(8).toString('hex')}`,
          externalRef: tenantRef,
        },
      }),
      prisma.client.teamUser.create({
        data: {
          id: uuid(),
          teamId,
          userId: SEEDED_ADMIN_ID,
          role: ROLES.teamOwner,
        },
      }),
    ]);
  }

  // 2. Website — keyed on externalRef (tenantRef)
  let websiteId: string;
  const existingWebsite = await prisma.client.website.findUnique({
    where: { externalRef: tenantRef },
    select: { id: true },
  });
  if (existingWebsite) {
    websiteId = existingWebsite.id;
  } else {
    websiteId = uuid();
    await prisma.client.website.create({
      data: {
        id: websiteId,
        name: tenantName.slice(0, 100),
        domain: domain.slice(0, 500),
        teamId,
        createdBy: SEEDED_ADMIN_ID,
        externalRef: tenantRef,
      },
    });
  }

  // 3. Per-admin: ensure user (keyed on remoteId) + team membership
  const adminUserIds: Record<string, string> = {};

  for (const { remoteId, displayName } of validAdmins) {
    // Username keyed on remoteId — guaranteed unique across tenants
    const username = `admin:${remoteId}`.slice(0, 255);

    let userId: string;
    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      userId = uuid();
      // Random locked password — login disabled in SSO-only deployments
      const password = hashPassword(crypto.randomBytes(32).toString('hex'));
      await prisma.client.user.create({
        data: {
          id: userId,
          username,
          password,
          role: ROLES.user,
          // displayName stored if provided (uses Prisma field if schema has it)
          ...(displayName ? { displayName: displayName.slice(0, 255) } : {}),
        },
        select: { id: true },
      });
    }

    // Ensure team membership — role pinned server-side, never from JWT
    const existingMembership = await getTeamUser(teamId, userId);
    if (!existingMembership) {
      await prisma.client.teamUser.create({
        data: {
          id: uuid(),
          teamId,
          userId,
          role: ROLES.teamMember,
        },
      });
    }

    adminUserIds[remoteId] = userId;
  }

  return Response.json({ teamId, websiteId, adminUserIds });
}
