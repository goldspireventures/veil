import { createHash, randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { normalizeEmail } from './auth.mjs';
import { MEMBERSHIP_POLICIES } from './membership.mjs';
import { getPolicyPack } from './policy-packs.mjs';

const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hashAdminToken(token) {
  return createHash('sha256').update(String(token || '').trim()).digest('hex');
}

function generateAdminToken() {
  return `gst_${randomBytes(32).toString('base64url')}`;
}

function generateJoinCode() {
  const pick = (count) => {
    let out = '';
    const bytes = randomBytes(count);
    for (let i = 0; i < count; i += 1) {
      out += JOIN_ALPHABET[bytes[i] % JOIN_ALPHABET.length];
    }
    return out;
  };
  return `${pick(4)}-${pick(4)}`;
}

function slugifyOrgId(displayName) {
  const base = String(displayName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomBytes(3).toString('hex')}`;
}

function defaultSettings(overrides = {}) {
  const rolloutPack = getPolicyPack('observational');
  const rolloutDlp = rolloutPack?.dlp || {
    version: 1,
    enabled: false,
    defaultAction: 'warn',
    categories: {},
    aiSurfaces: { defaultAction: 'block', categories: {} },
  };

  return {
    passphraseFromVault: false,
    useSavedPassphrase: true,
    defaultSecureMode: 'team',
    enforceStrongPassphrase: true,
    membershipPolicy: 'invite',
    allowedEmailDomains: [],
    policyPackId: 'observational',
    dlp: rolloutDlp,
    copilotEnabled: true,
    productAnalytics: true,
    selectionUiMode: 'smart',
    ...overrides,
  };
}

function publicSettings(settings) {
  const parsed = typeof settings === 'object' && settings ? settings : {};
  return {
    passphraseFromVault: parsed.passphraseFromVault === true,
    useSavedPassphrase: parsed.useSavedPassphrase !== false,
    defaultSecureMode: parsed.defaultSecureMode === 'one-time' ? 'one-time' : 'team',
    enforceStrongPassphrase: parsed.enforceStrongPassphrase !== false,
    membershipPolicy: ['open', 'invite', 'domain'].includes(parsed.membershipPolicy)
      ? parsed.membershipPolicy
      : 'invite',
    allowedEmailDomains: Array.isArray(parsed.allowedEmailDomains)
      ? parsed.allowedEmailDomains
      : [],
    ...(parsed.resecureDelaySeconds != null
      ? { resecureDelaySeconds: parsed.resecureDelaySeconds }
      : {}),
    ...(parsed.dlp && typeof parsed.dlp === 'object'
      ? { dlp: parsed.dlp }
      : {}),
    ...(parsed.analytics && typeof parsed.analytics === 'object'
      ? {
        analytics: {
          siemWebhookUrl: String(parsed.analytics.siemWebhookUrl || ''),
          siemWebhookConfigured: Boolean(parsed.analytics.siemWebhookUrl),
        },
      }
      : {}),
  };
}

function publicOrgRow(row) {
  const settings = typeof row.settings === 'object' && row.settings ? row.settings : {};
  return {
    orgId: row.id,
    displayName: row.display_name,
    policyVersion: row.policy_version,
    adminEmail: row.admin_email || null,
    settings: publicSettings(settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function authenticateAdmin(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw httpError(401, 'Missing admin sign-in key.');

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, display_name, team_passphrase, policy_version, settings,
            admin_email, created_at, updated_at
     FROM organizations
     WHERE admin_token_hash = $1`,
    [hashAdminToken(token)],
  );

  if (result.rowCount === 0) throw httpError(401, 'Invalid admin sign-in key.');
  return { token, org: result.rows[0] };
}

export async function createOrganization(body = {}) {
  const displayName = String(body.displayName || body.display_name || '').trim();
  const teamPassphrase = String(body.teamPassphrase || body.team_passphrase || '').trim();
  const adminEmail = normalizeEmail(body.adminEmail || body.admin_email || '');

  if (displayName.length < 2) throw httpError(400, 'Team name must be at least 2 characters.');
  if (displayName.length > 120) throw httpError(400, 'Team name is too long.');
  if (teamPassphrase.length < 12) {
    throw httpError(400, 'Team passphrase must be at least 16 characters.');
  }

  const allowedEmailDomains = parseAllowedDomains(body);
  const settings = defaultSettings(body.settings);
  if (allowedEmailDomains.length > 0) {
    settings.membershipPolicy = 'domain';
    settings.allowedEmailDomains = allowedEmailDomains;
  } else if (body.membershipPolicy && MEMBERSHIP_POLICIES.has(String(body.membershipPolicy))) {
    settings.membershipPolicy = String(body.membershipPolicy);
  }

  const orgId = slugifyOrgId(displayName);
  const joinCode = generateJoinCode();
  const adminToken = generateAdminToken();
  const adminTokenHash = hashAdminToken(adminToken);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgResult = await client.query(
      `INSERT INTO organizations (
         id, display_name, team_passphrase, policy_version, settings,
         admin_token_hash, admin_email
       )
       VALUES ($1, $2, $3, 1, $4::jsonb, $5, $6)
       RETURNING id, display_name, policy_version, admin_email, created_at, updated_at, settings`,
      [
        orgId,
        displayName,
        teamPassphrase,
        JSON.stringify(settings),
        adminTokenHash,
        adminEmail || null,
      ],
    );

    await client.query(
      `INSERT INTO join_codes (code, org_id, active)
       VALUES ($1, $2, true)`,
      [joinCode, orgId],
    );

    if (adminEmail) {
      await client.query(
        `INSERT INTO org_members (org_id, email, display_name, active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (org_id, email) DO NOTHING`,
        [orgId, adminEmail, 'Admin'],
      );
    }

    await client.query('COMMIT');

    const org = orgResult.rows[0];
    return {
      ...publicOrgRow(org),
      joinCode,
      adminToken,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw httpError(409, 'Could not create team — try a different name.');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrganization(admin) {
  return publicOrgRow(admin.org);
}

export async function updateOrganization(admin, body = {}) {
  const pool = getPool();
  const patches = [];
  const values = [];
  let index = 1;

  const displayName = body.displayName != null ? String(body.displayName).trim() : null;
  if (displayName != null) {
    if (displayName.length < 2) throw httpError(400, 'Team name must be at least 2 characters.');
    patches.push(`display_name = $${index++}`);
    values.push(displayName);
  }

  const adminEmail = body.adminEmail != null ? normalizeEmail(body.adminEmail) : null;
  if (adminEmail != null) {
    patches.push(`admin_email = $${index++}`);
    values.push(adminEmail || null);
  }

  const teamPassphrase = body.teamPassphrase != null
    ? String(body.teamPassphrase).trim()
    : null;
  if (teamPassphrase != null) {
    if (teamPassphrase.length < 12) {
      throw httpError(400, 'Team passphrase must be at least 16 characters.');
    }
    patches.push(`team_passphrase = $${index++}`);
    values.push(teamPassphrase);
    patches.push(`policy_version = policy_version + 1`);
  }

  if (body.settings && typeof body.settings === 'object') {
    const current = typeof admin.org.settings === 'object' && admin.org.settings
      ? admin.org.settings
      : {};
    const merged = { ...current, ...body.settings };
    const dlpChanged = body.settings.dlp != null
      && JSON.stringify(body.settings.dlp) !== JSON.stringify(current.dlp);
    const packChanged = body.settings.policyPackId != null
      && body.settings.policyPackId !== current.policyPackId;
    if (dlpChanged || packChanged) {
      patches.push('policy_version = policy_version + 1');
    }
    if (body.settings.analytics && typeof body.settings.analytics === 'object') {
      const prevAnalytics = current.analytics && typeof current.analytics === 'object'
        ? current.analytics
        : {};
      merged.analytics = { ...prevAnalytics, ...body.settings.analytics };
      if (!body.settings.analytics.siemWebhookSecret) {
        merged.analytics.siemWebhookSecret = prevAnalytics.siemWebhookSecret;
      }
    }
    if (merged.membershipPolicy && !MEMBERSHIP_POLICIES.has(merged.membershipPolicy)) {
      throw httpError(400, 'membershipPolicy must be open, invite, or domain.');
    }
    if (merged.allowedEmailDomains) {
      merged.allowedEmailDomains = parseAllowedDomains({ allowedEmailDomains: merged.allowedEmailDomains });
    }
    patches.push(`settings = $${index++}::jsonb`);
    values.push(JSON.stringify(merged));
  }

  if (patches.length === 0) {
    return publicOrgRow(admin.org);
  }

  patches.push('updated_at = now()');
  values.push(admin.org.id);

  const result = await pool.query(
    `UPDATE organizations
     SET ${patches.join(', ')}
     WHERE id = $${index}
     RETURNING id, display_name, policy_version, settings, admin_email, created_at, updated_at`,
    values,
  );

  return publicOrgRow(result.rows[0]);
}

export async function listJoinCodes(admin) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT code, active, expires_at, created_at
     FROM join_codes
     WHERE org_id = $1
     ORDER BY created_at DESC`,
    [admin.org.id],
  );

  return {
    joinCodes: result.rows.map((row) => ({
      code: row.code,
      active: row.active,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
  };
}

export async function createJoinCode(admin, body = {}) {
  const pool = getPool();
  const code = generateJoinCode();
  const expiresAt = body.expiresAt || body.expires_at || null;

  await pool.query(
    `INSERT INTO join_codes (code, org_id, active, expires_at)
     VALUES ($1, $2, true, $3)`,
    [code, admin.org.id, expiresAt],
  );

  return { code, active: true, expiresAt };
}

export async function setJoinCodeActive(admin, code, active) {
  const normalized = String(code || '').trim().toUpperCase();
  const pool = getPool();
  const result = await pool.query(
    `UPDATE join_codes
     SET active = $1
     WHERE org_id = $2 AND UPPER(code) = $3
     RETURNING code, active, expires_at`,
    [Boolean(active), admin.org.id, normalized],
  );

  if (result.rowCount === 0) throw httpError(404, 'Join code not found.');
  const row = result.rows[0];
  return { code: row.code, active: row.active, expiresAt: row.expires_at };
}

export async function listMembersAdmin(admin) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT m.email, m.display_name, m.device_id IS NOT NULL AS registered, m.active,
            m.created_at, m.updated_at, m.team_id, t.name AS team_name
     FROM org_members m
     LEFT JOIN org_teams t ON t.id = m.team_id
     WHERE m.org_id = $1
     ORDER BY m.email`,
    [admin.org.id],
  );

  return {
    members: result.rows.map((row) => ({
      email: row.email,
      displayName: row.display_name,
      registered: row.registered,
      active: row.active,
      teamId: row.team_id || null,
      teamName: row.team_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function listDevices(admin) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT dp.device_id, dp.policy_version, dp.revoked_at, dp.created_at, dp.updated_at,
            om.email AS member_email
     FROM device_provisions dp
     LEFT JOIN org_members om
       ON om.org_id = dp.org_id AND om.device_id = dp.device_id
     WHERE dp.org_id = $1
     ORDER BY dp.updated_at DESC`,
    [admin.org.id],
  );

  return {
    devices: result.rows.map((row) => ({
      deviceId: row.device_id,
      memberEmail: row.member_email,
      policyVersion: row.policy_version,
      revoked: Boolean(row.revoked_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function revokeDevice(admin, deviceId) {
  const device = String(deviceId || '').trim();
  if (!device) throw httpError(400, 'Device id is required.');

  const pool = getPool();
  const result = await pool.query(
    `UPDATE device_provisions
     SET revoked_at = now(), updated_at = now()
     WHERE org_id = $1 AND device_id = $2 AND revoked_at IS NULL
     RETURNING device_id`,
    [admin.org.id, device],
  );

  if (result.rowCount === 0) throw httpError(404, 'Device not found or already revoked.');
  return { ok: true, deviceId: device };
}

export async function deactivateMember(admin, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw httpError(400, 'Member email is required.');

  const pool = getPool();
  const result = await pool.query(
    `UPDATE org_members
     SET active = false, device_id = NULL, updated_at = now()
     WHERE org_id = $1 AND email = $2 AND active = true
     RETURNING email`,
    [admin.org.id, normalized],
  );

  if (result.rowCount === 0) throw httpError(404, 'Member not found.');
  return { ok: true, email: normalized };
}

export async function addOrgMember(admin, body = {}) {
  const email = normalizeEmail(body.email);
  const displayName = String(body.displayName || body.display_name || '').trim() || null;
  if (!email || !email.includes('@')) throw httpError(400, 'Valid member email is required.');

  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO org_members (org_id, email, display_name, active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (org_id, email) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, org_members.display_name),
       active = true,
       updated_at = now()
     RETURNING email, display_name, device_id IS NOT NULL AS registered`,
    [admin.org.id, email, displayName],
  );

  return { ok: true, member: result.rows[0] };
}

function parseAllowedDomains(body = {}) {
  const raw = body.allowedEmailDomains ?? body.allowedEmailDomain ?? body.emailDomain ?? '';
  const values = Array.isArray(raw)
    ? raw
    : String(raw || '').split(',').map((s) => s.trim());
  return values
    .map((d) => d.replace(/^@+/, '').toLowerCase())
    .filter(Boolean);
}
