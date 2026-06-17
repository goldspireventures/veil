/**
 * API scenario tests — walk real org/member/admin flows against the database.
 * Skipped when DATABASE_URL is unset.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import {
  cleanupScenarioOrg,
  demoPublicJwk,
  hasDatabase,
  loadDotEnv,
  loadExtensionCrypto,
  mockAdminReq,
} from './helpers.mjs';

loadDotEnv();

const TEAM_PASS = 'Scenario-Team-Passphrase-2026!';
let lastOrgId = '';

after(async () => {
  if (lastOrgId) {
    try {
      await cleanupScenarioOrg(lastOrgId);
    } catch {
      // Pool may already be closed.
    }
  }
});

test('scenario: member joins org, registers, syncs policy', { skip: !hasDatabase() }, async () => {
  const { createOrganization } = await import('../../api/src/admin-service.mjs');
  const { joinWithCode, syncPolicy } = await import('../../api/src/org-service.mjs');
  const { registerMember } = await import('../../api/src/share-service.mjs');
  const { closePool } = await import('../../api/src/db.mjs');

  const created = await createOrganization({
    displayName: `Scenario Join ${randomBytes(3).toString('hex')}`,
    teamPassphrase: TEAM_PASS,
    adminEmail: 'joiner@scenario.veil',
    settings: { membershipPolicy: 'invite' },
  });
  lastOrgId = created.orgId;

  const deviceId = `scenario-dev-${randomBytes(4).toString('hex')}`;
  const joined = await joinWithCode(created.joinCode, deviceId, 'joiner@scenario.veil');

  assert.equal(joined.orgId, created.orgId);
  assert.ok(joined.provisionToken);
  assert.equal(joined.teamPassphrase, TEAM_PASS);

  await registerMember(joined.provisionToken, deviceId, {
    email: 'joiner@scenario.veil',
    displayName: 'Joiner',
    publicKeyJwk: demoPublicJwk(),
  });

  const unchanged = await syncPolicy(joined.provisionToken, deviceId, joined.policyVersion);
  assert.equal(unchanged.unchanged, true);

  const { getPool } = await import('../../api/src/db.mjs');
  await getPool().query(
    'UPDATE organizations SET policy_version = policy_version + 1 WHERE id = $1',
    [created.orgId],
  );

  const synced = await syncPolicy(joined.provisionToken, deviceId, joined.policyVersion);
  assert.equal(synced.unchanged, false);
  assert.ok(synced.payload?.teamPassphrase);

  await closePool();
});

test('scenario: tokenize ciphertext roundtrip via API', { skip: !hasDatabase() }, async () => {
  const crypto = loadExtensionCrypto();
  const { createOrganization } = await import('../../api/src/admin-service.mjs');
  const { joinWithCode } = await import('../../api/src/org-service.mjs');
  const { createSecureToken, resolveSecureToken } = await import('../../api/src/token-service.mjs');
  const { closePool } = await import('../../api/src/db.mjs');

  const created = await createOrganization({
    displayName: `Scenario Token ${randomBytes(3).toString('hex')}`,
    teamPassphrase: TEAM_PASS,
    settings: { membershipPolicy: 'open' },
  });
  lastOrgId = created.orgId;

  const deviceId = `scenario-dev-${randomBytes(4).toString('hex')}`;
  const joined = await joinWithCode(created.joinCode, deviceId, 'token-user@scenario.veil');
  const secret = 'sk-live-abcdef1234567890';
  const ciphertext = await crypto.encryptText(secret, TEAM_PASS, {
    mode: 'team',
    profile: 'organization',
  });

  const stored = await createSecureToken(joined.provisionToken, deviceId, {
    ciphertext,
    category: 'api_key',
    burnAfterRead: true,
    maxReads: 1,
  });
  assert.ok(stored.tokenId.startsWith('vt_'));

  const resolved = await resolveSecureToken(joined.provisionToken, deviceId, stored.tokenId);
  const plaintext = await crypto.decryptText(resolved.ciphertext, TEAM_PASS, {
    mode: 'team',
    profile: 'organization',
  });
  assert.equal(plaintext, secret);

  await assert.rejects(
    () => resolveSecureToken(joined.provisionToken, deviceId, stored.tokenId),
    (err) => err.status === 404 || err.status === 410,
  );

  await closePool();
});

test('scenario: security events ingest, summary, export', { skip: !hasDatabase() }, async () => {
  const { createOrganization, authenticateAdmin } = await import('../../api/src/admin-service.mjs');
  const { joinWithCode } = await import('../../api/src/org-service.mjs');
  const { ingestExtensionEvents, getSecurityEventSummary, exportSecurityEvents } =
    await import('../../api/src/events-service.mjs');
  const { closePool } = await import('../../api/src/db.mjs');

  const created = await createOrganization({
    displayName: `Scenario Events ${randomBytes(3).toString('hex')}`,
    teamPassphrase: TEAM_PASS,
    settings: { membershipPolicy: 'open' },
  });
  lastOrgId = created.orgId;

  const deviceId = `scenario-dev-${randomBytes(4).toString('hex')}`;
  const joined = await joinWithCode(created.joinCode, deviceId, 'events@scenario.veil');

  const ingested = await ingestExtensionEvents(joined.provisionToken, deviceId, {
    events: [
      {
        at: Date.now(),
        type: 'detection',
        category: 'api_key',
        severity: 'critical',
        host: 'mail.google.com',
        source: 'paste',
        action: 'observe',
        confidence: 95,
      },
      {
        at: Date.now(),
        type: 'policy_block',
        category: 'api_key',
        severity: 'critical',
        host: 'chatgpt.com',
        source: 'ai_prompt',
        action: 'block',
        confidence: 98,
      },
    ],
  });
  assert.equal(ingested.ingested, 2);

  await assert.rejects(
    () => ingestExtensionEvents(joined.provisionToken, deviceId, {
      events: [{ at: Date.now(), type: 'detection', matchedText: 'secret' }],
    }),
    (err) => err.status === 400,
  );

  const admin = await authenticateAdmin(mockAdminReq(created.adminToken));
  const summary = await getSecurityEventSummary(admin, { days: 7 });
  assert.ok((summary.totals?.total || 0) >= 2);

  const exported = await exportSecurityEvents(admin, { days: 7, format: 'csv' });
  assert.equal(exported.format, 'csv');
  assert.ok(exported.content.includes('api_key'));
  assert.ok(!exported.content.includes('sk-live'));

  await closePool();
});

test('scenario: sub-team DLP flows to member sync payload', { skip: !hasDatabase() }, async () => {
  const { createOrganization, authenticateAdmin } = await import('../../api/src/admin-service.mjs');
  const { joinWithCode, syncPolicy } = await import('../../api/src/org-service.mjs');
  const { registerMember } = await import('../../api/src/share-service.mjs');
  const { createTeam, assignMemberTeam } = await import('../../api/src/teams-service.mjs');
  const { closePool, getPool } = await import('../../api/src/db.mjs');

  const created = await createOrganization({
    displayName: `Scenario Teams ${randomBytes(3).toString('hex')}`,
    teamPassphrase: TEAM_PASS,
    adminEmail: 'teams-admin@scenario.veil',
    settings: { membershipPolicy: 'invite' },
  });
  lastOrgId = created.orgId;

  const admin = await authenticateAdmin(mockAdminReq(created.adminToken));
  const team = await createTeam(admin, { name: 'Engineering' });
  await assignMemberTeam(admin, { email: 'teams-admin@scenario.veil', teamId: team.team.teamId });

  await getPool().query(
    `UPDATE org_teams SET settings = $1::jsonb WHERE id = $2`,
    [
      JSON.stringify({
        dlp: {
          enabled: true,
          defaultAction: 'warn',
          categories: { api_key: { action: 'block', minSeverity: 'high' } },
        },
      }),
      team.team.teamId,
    ],
  );

  const deviceId = `scenario-dev-${randomBytes(4).toString('hex')}`;
  const joined = await joinWithCode(created.joinCode, deviceId, 'teams-admin@scenario.veil');
  assert.equal(joined.settings?.teamDlp?.categories?.api_key?.action, 'block');

  await registerMember(joined.provisionToken, deviceId, {
    email: 'teams-admin@scenario.veil',
    publicKeyJwk: demoPublicJwk(),
  });

  await getPool().query('UPDATE organizations SET policy_version = policy_version + 1 WHERE id = $1', [
    created.orgId,
  ]);

  const synced = await syncPolicy(joined.provisionToken, deviceId, joined.policyVersion);
  assert.equal(synced.payload?.settings?.teamDlp?.categories?.api_key?.action, 'block');

  await closePool();
});

test('scenario: SIEM webhook receives metadata on ingest', { skip: !hasDatabase() }, async () => {
  const { createOrganization, authenticateAdmin, updateOrganization } =
    await import('../../api/src/admin-service.mjs');
  const { joinWithCode } = await import('../../api/src/org-service.mjs');
  const { ingestExtensionEvents } = await import('../../api/src/events-service.mjs');
  const { closePool } = await import('../../api/src/db.mjs');

  const created = await createOrganization({
    displayName: `Scenario SIEM ${randomBytes(3).toString('hex')}`,
    teamPassphrase: TEAM_PASS,
    settings: { membershipPolicy: 'open' },
  });
  lastOrgId = created.orgId;

  const received = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200);
        res.end('ok');
        server.close();
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      const webhookUrl = `http://127.0.0.1:${port}/veil`;
      const admin = await authenticateAdmin(mockAdminReq(created.adminToken));
      await updateOrganization(admin, {
        settings: {
          analytics: { siemWebhookUrl: webhookUrl, siemWebhookSecret: 'test-secret' },
        },
      });

      const deviceId = `scenario-dev-${randomBytes(4).toString('hex')}`;
      const joined = await joinWithCode(created.joinCode, deviceId, 'siem@scenario.veil');
      await ingestExtensionEvents(joined.provisionToken, deviceId, {
        events: [{
          at: Date.now(),
          type: 'detection',
          category: 'jwt',
          severity: 'high',
          host: 'claude.ai',
          source: 'ai_prompt',
          action: 'observe',
          confidence: 90,
        }],
      });
    });
  });

  assert.equal(received.source, 'veil');
  assert.equal(received.orgId, created.orgId);
  assert.ok(Array.isArray(received.events));
  assert.equal(received.events[0].category, 'jwt');
  assert.ok(!JSON.stringify(received).includes('plaintext'));

  await closePool();
});
