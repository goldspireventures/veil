/**
 * Organization capability checks — cloud, managed, and feature gates.
 */
(function (global) {
  function hasOrgId(settings) {
    return Boolean(String(settings?.orgId || '').trim());
  }

  function isCloudOrg(settings) {
    return settings?.orgProvisionSource === 'cloud' && hasOrgId(settings);
  }

  function isManagedOrg(settings) {
    return settings?.orgProvisionSource === 'managed' && hasOrgId(settings);
  }

  function isOrgProfile(settings) {
    return settings?.securityProfile === 'organization' || hasOrgId(settings);
  }

  /** Cloud join with API token — sync, events upload, tokenize API. */
  function canUseCloudApi(settings) {
    return Boolean(global.GoldspireConstants?.ORG_API_BASE) && isCloudOrg(settings);
  }

  /** Tokenize and org sharing require cloud API provision. */
  function canUseCloudOrgFeatures(settings) {
    return canUseCloudApi(settings);
  }

  function tokenizeUnavailableReason(settings) {
    if (!global.GoldspireConstants?.ORG_API_BASE) {
      return 'Tokenize requires Veil cloud — not configured for this build.';
    }
    if (!hasOrgId(settings)) {
      return 'Join a Veil team to use Tokenize.';
    }
    if (settings?.orgProvisionSource === 'managed') {
      return 'Tokenize requires cloud team join. IT-managed installs can secure and mask; ask your admin about cloud provisioning.';
    }
    if (!isCloudOrg(settings)) {
      return 'Join a Veil team to use Tokenize.';
    }
    return '';
  }

  global.GoldspireOrgCapability = {
    hasOrgId,
    isCloudOrg,
    isManagedOrg,
    isOrgProfile,
    canUseCloudApi,
    canUseCloudOrgFeatures,
    tokenizeUnavailableReason,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
