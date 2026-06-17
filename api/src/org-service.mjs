import { randomBytes } from 'node:crypto';
import { getPool } from './db.mjs';

function newProvisionToken() {
  return randomBytes(32).toString('hex');
}

function orgPayload(org, provisionToken) {
  const settings = typeof org.settings === 'object' && org.settings ? org.settings : {};
  return {
    orgId: org.id,
    orgDisplayName: org.display_name,
    teamPassphrase: org.team_passphrase,
    policyVersion: org.policy_version,
    provisionToken,
    settings: {
      orgId: org.id,
      orgDisplayName: org.display_name,
      passphraseFromVault: settings.passphraseFromVault === true,
      useSavedPassphrase: settings.useSavedPassphrase !== false,
      defaultSecureMode: settings.defaultSecureMode === 'one-time' ? 'one-time' : 'team',
      enforceStrongPassphrase: settings.enforceStrongPassphrase !== false,
      ...(settings.resecureDelaySeconds != null
        ? { resecureDelaySeconds: settings.resecureDelaySeconds }
        : {}),
    },
  };
}

function normalizeJoinCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

export async function joinWithCode(joinCode, deviceId) {
  const code = normalizeJoinCode(joinCode);
  const device = String(deviceId || '').trim();
  if (!code) throw httpError(400, 'Enter your organization join code.');
  if (!device) throw httpError(400, 'Missing device id.');

  const pool = getPool();
  const joinResult = await pool.query(
    `SELECT jc.code, o.id, o.display_name, o.team_passphrase, o.policy_version, o.settings
     FROM join_codes jc
     JOIN organizations o ON o.id = jc.org_id
     WHERE UPPER(REPLACE(REPLACE(jc.code, '-', ''), ' ', '')) = $1
       AND jc.active = true
       AND (jc.expires_at IS NULL OR jc.expires_at > now())`,
    [code],
  );

  if (joinResult.rowCount === 0) {
    console.warn('[org/join] no match for code:', code);
    throw httpError(404, 'Invalid or expired join code.');
  }

  const org = joinResult.rows[0];
  const token = newProvisionToken();

  const provisionResult = await pool.query(
    `INSERT INTO device_provisions (org_id, device_id, provision_token, policy_version)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, device_id) DO UPDATE SET
       provision_token = EXCLUDED.provision_token,
       policy_version = EXCLUDED.policy_version,
       revoked_at = NULL,
       updated_at = now()
     RETURNING provision_token`,
    [org.id, device, token, org.policy_version],
  );

  const provisionToken = provisionResult.rows[0].provision_token;
  return orgPayload(org, provisionToken);
}

export async function syncPolicy(token, deviceId, clientPolicyVersion) {
  const device = String(deviceId || '').trim();
  const bearer = String(token || '').trim();
  if (!bearer) throw httpError(401, 'Missing provision token.');
  if (!device) throw httpError(400, 'Missing device id.');

  const pool = getPool();
  const result = await pool.query(
    `SELECT dp.provision_token, dp.policy_version AS client_version, dp.revoked_at,
            o.id, o.display_name, o.team_passphrase, o.policy_version, o.settings
     FROM device_provisions dp
     JOIN organizations o ON o.id = dp.org_id
     WHERE dp.provision_token = $1 AND dp.device_id = $2`,
    [bearer, device],
  );

  if (result.rowCount === 0) {
    throw httpError(401, 'Invalid provision token.');
  }

  const row = result.rows[0];
  if (row.revoked_at) {
    throw httpError(401, 'Provision revoked.');
  }

  const clientVersion = Number(clientPolicyVersion) || 0;
  if (clientVersion >= row.policy_version) {
    return { unchanged: true };
  }

  await pool.query(
    `UPDATE device_provisions
     SET policy_version = $1, updated_at = now()
     WHERE provision_token = $2`,
    [row.policy_version, bearer],
  );

  return {
    unchanged: false,
    payload: orgPayload(row, bearer),
  };
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
