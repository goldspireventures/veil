/**
 * Veil action registry — metadata and recommendations for copilot / DLP.
 */
(function (global) {
  const ACTION_IDS = Object.freeze({
    encrypt: 'encrypt',
    mask: 'mask',
    tokenize: 'tokenize',
    copy_secure: 'copy_secure',
    block: 'block',
    ignore: 'ignore',
  });

  const ACTION_DEFS = Object.freeze({
    encrypt: {
      id: ACTION_IDS.encrypt,
      label: 'Secure',
      description: 'Replace with [redacted] — team, specific people, or one-time',
      priority: 10,
    },
    mask: {
      id: ACTION_IDS.mask,
      label: 'Mask',
      description: 'Replace sensitive values with masked previews',
      priority: 20,
    },
    tokenize: {
      id: ACTION_IDS.tokenize,
      label: 'Tokenize',
      description: 'Replace with a reversible secure token',
      priority: 30,
    },
    copy_secure: {
      id: ACTION_IDS.copy_secure,
      label: 'Copy secured',
      description: 'Encrypt and copy secured payload to clipboard',
      priority: 40,
    },
    block: {
      id: ACTION_IDS.block,
      label: 'Block',
      description: 'Prevent sharing sensitive content',
      priority: 50,
    },
    ignore: {
      id: ACTION_IDS.ignore,
      label: 'Allow',
      description: 'Keep this text as-is for now',
      priority: 60,
    },
  });

  function isAiSurface(context = {}) {
    return context.isAiSurface === true || context.source === 'ai_prompt';
  }

  function isActionEnabled(settings) {
    return global.GoldspireSettings?.isVeilActive?.(settings) === true
      || global.GoldspireVeilEvents?.isEnabled?.(settings) === true;
  }

  function availabilityFor(actionId, context = {}, settings = {}) {
    const def = ACTION_DEFS[actionId];
    if (!def) return { available: false, reason: 'unknown_action' };

    if (def.stub) {
      return { available: false, reason: 'coming_soon', stub: true };
    }

    if (!isActionEnabled(settings)) {
      return { available: false, reason: 'veil_disabled' };
    }

    const ai = isAiSurface(context);

    if (actionId === ACTION_IDS.encrypt && ai) {
      return { available: false, reason: 'sanitize_first_on_ai' };
    }

    if (actionId === ACTION_IDS.block) {
      const mode = String(settings.dlpMode || 'off').toLowerCase();
      if (mode !== 'enforce' && !ai) {
        return { available: false, reason: 'enforce_only' };
      }
    }

    if (actionId === ACTION_IDS.copy_secure && ai) {
      return { available: false, reason: 'not_on_ai_surface' };
    }

    if (actionId === ACTION_IDS.tokenize) {
      if (ai) return { available: false, reason: 'not_on_ai_surface' };
      if (!global.GoldspireOrgCapability?.canUseCloudOrgFeatures?.(settings)) {
        const hint = global.GoldspireOrgCapability?.tokenizeUnavailableReason?.(settings)
          || 'Join a Veil team to use Tokenize.';
        return { available: false, reason: 'org_required', hint };
      }
    }

    return { available: true };
  }

  function listAvailable(context = {}, settings = {}, detections = []) {
    const ordered = Object.values(ACTION_DEFS)
      .map((def) => {
        const gate = availabilityFor(def.id, context, settings);
        return {
          ...def,
          available: gate.available,
          reason: gate.reason || '',
          hint: gate.hint || '',
          stub: Boolean(def.stub || gate.stub),
        };
      })
      .filter((entry) => entry.available || entry.stub || entry.id === ACTION_IDS.ignore)
      .sort((a, b) => a.priority - b.priority);

    if (detections.length === 0) {
      return ordered.filter((entry) => entry.id === ACTION_IDS.ignore);
    }

    return ordered;
  }

  function recommendPrimary(detections = [], context = {}, settings = {}) {
    if (!detections.length) return ACTION_IDS.ignore;

    const ai = isAiSurface(context);
    const severity = global.GoldspireScoring?.highestSeverity?.(detections) || 'low';
    const categories = new Set(detections.map((d) => d.category));

    if (ai) {
      if (severity === 'critical' || categories.has('api_key') || categories.has('jwt')) {
        return ACTION_IDS.block;
      }
      return ACTION_IDS.mask;
    }

    if (
      categories.has('api_key')
      || categories.has('jwt')
      || categories.has('credit_card')
      || categories.has('ssn')
    ) {
      return ACTION_IDS.encrypt;
    }

    if (severity === 'high' || severity === 'critical') {
      return ACTION_IDS.encrypt;
    }

    return ACTION_IDS.mask;
  }

  function recommendHint(actionId, context = {}, settings = {}) {
    const ai = isAiSurface(context);
    const copy = global.GoldspireCopy;
    const isOrg = copy?.isOrgProfile?.(settings)
      || context.securityProfile === 'organization'
      || Boolean(settings?.orgId);
    if (actionId === ACTION_IDS.encrypt && !ai) {
      if (isOrg) {
        return `Best for email and chat — recipients with your team passphrase can unlock.`;
      }
      const mode = String(settings?.defaultSecureMode || context.defaultSecureMode || 'one-time');
      if (mode === 'one-time') {
        return 'Best for email and chat — recipients unlock with a one-time code or your passphrase.';
      }
      return 'Best for email and chat — recipients with your passphrase can unlock.';
    }
    if (actionId === ACTION_IDS.mask) {
      return ai
        ? 'Hides values before sending to AI.'
        : 'Quick redaction when you only need to hide the value.';
    }
    if (actionId === ACTION_IDS.tokenize) {
      return 'Reversible placeholder stored by your organization.';
    }
    if (actionId === ACTION_IDS.ignore) {
      return 'Only if you\'re sure this is safe to share.';
    }
    return '';
  }

  global.GoldspireVeilActionRegistry = {
    ACTION_IDS,
    ACTION_DEFS,
    listAvailable,
    recommendPrimary,
    recommendHint,
    availabilityFor,
    isAiSurface,
    isActionEnabled,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
