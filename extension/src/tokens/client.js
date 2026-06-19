/**
 * Veil secure token client — encrypt locally, store ciphertext server-side.
 */
(function (global) {
  async function canUseTokens(settings) {
    if (global.GoldspireOrgCapability?.canUseCloudOrgFeatures) {
      return global.GoldspireOrgCapability.canUseCloudOrgFeatures(settings);
    }
    return Boolean(
      global.GoldspireConstants?.ORG_API_BASE
      && settings?.orgProvisionSource === 'cloud'
      && settings?.orgId,
    );
  }

  async function createToken(plaintext, settings = {}, options = {}) {
    const text = String(plaintext || '').trim();
    if (!text) return { ok: false, error: 'no_text' };
    if (!(await canUseTokens(settings))) {
      return { ok: false, error: 'org_required' };
    }

    const profile = settings.securityProfile === 'organization' ? 'organization' : 'personal';
    let unlockSecret = options.unlockSecret || '';
    if (!unlockSecret && global.GoldspireSecrets) {
      unlockSecret = settings.passphrase?.trim()
        || (await global.GoldspireSecrets.loadPassphrase?.(profile))
        || '';
    }
    if (!unlockSecret) return { ok: false, error: 'no_passphrase' };

    const ciphertext = await global.GoldspireSecureCrypto.encryptText(text, unlockSecret, {
      mode: 'team',
      profile,
    });

    let record;
    try {
      record = await global.GoldspireVeilTokenApi?.createTokenRecord?.({
        ciphertext,
        category: options.category || '',
        ttlMs: options.ttlMs,
        maxReads: options.maxReads ?? 25,
        burnAfterRead: options.burnAfterRead ?? false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create token.';
      return { ok: false, error: 'create_failed', message };
    }

    global.GoldspireSecrets?.clearMemoryString?.(unlockSecret);

    if (!record?.tokenId) return { ok: false, error: 'create_failed' };

    return {
      ok: true,
      tokenId: record.tokenId,
      placeholder: global.GoldspireVeilTokenFormat?.formatPlaceholder?.(record.tokenId),
      expiresAt: record.expiresAt,
    };
  }

  async function resolveToken(tokenId, settings = {}, options = {}) {
    if (!(await canUseTokens(settings))) {
      return { ok: false, error: 'org_required' };
    }

    let record;
    try {
      record = await global.GoldspireVeilTokenApi?.resolveTokenRecord?.(tokenId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/not found|404/i.test(message)) {
        return { ok: false, error: 'not_found' };
      }
      if (/expired|read limit|410/i.test(message)) {
        return { ok: false, error: 'expired' };
      }
      return { ok: false, error: 'resolve_failed', message: message || 'Could not resolve token.' };
    }

    if (!record?.ciphertext) return { ok: false, error: 'not_found' };

    const profile = settings.securityProfile === 'organization' ? 'organization' : 'personal';
    let unlockSecret = options.unlockSecret || '';
    if (!unlockSecret) {
      unlockSecret = settings.passphrase?.trim()
        || (await global.GoldspireSecrets.loadPassphrase?.(profile))
        || '';
    }
    if (!unlockSecret) return { ok: false, error: 'no_passphrase' };

    let plaintext;
    try {
      plaintext = await global.GoldspireSecureCrypto.decryptText(record.ciphertext, unlockSecret, {
        profile,
        mode: 'team',
      });
    } catch {
      return { ok: false, error: 'wrong_passphrase' };
    }
    global.GoldspireSecrets?.clearMemoryString?.(unlockSecret);

    try {
      await global.GoldspireVeilTokenApi?.consumeTokenRecord?.(tokenId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/not found|404/i.test(message)) {
        return { ok: false, error: 'not_found' };
      }
      if (/expired|read limit|410/i.test(message)) {
        return { ok: false, error: 'expired' };
      }
      return { ok: false, error: 'consume_failed', message: message || 'Could not finalize token reveal.' };
    }

    return { ok: true, plaintext, tokenId: record.tokenId, category: record.category };
  }

  global.GoldspireVeilTokens = {
    canUseTokens,
    createToken,
    resolveToken,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
