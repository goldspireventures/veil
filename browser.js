/**
 * Cross-browser API shim (Chrome, Edge, Firefox).
 */
(function (global) {
  const api = typeof global.browser !== 'undefined' ? global.browser : global.chrome;

  function isInvalidatedError(error) {
    const message = error?.message || String(error || '');
    return (
      message.includes('Extension context invalidated')
      || message.includes('message port closed')
      || message.includes('Receiving end does not exist')
    );
  }

  function storageGet(area, defaults) {
    return new Promise((resolve) => {
      try {
        const store = api?.storage?.[area];
        if (!store?.get) {
          resolve({ ...defaults });
          return;
        }
        store.get(defaults, (result) => {
          try {
            if (api?.runtime?.lastError) {
              resolve({ ...defaults });
              return;
            }
            resolve(result || { ...defaults });
          } catch {
            resolve({ ...defaults });
          }
        });
      } catch {
        resolve({ ...defaults });
      }
    });
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        if (!api?.runtime?.sendMessage) {
          resolve(null);
          return;
        }
        api.runtime.sendMessage(message, (response) => {
          try {
            if (api.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(response ?? null);
          } catch {
            resolve(null);
          }
        });
      } catch {
        resolve(null);
      }
    });
  }

  function isValid() {
    try {
      return Boolean(api?.runtime?.id);
    } catch {
      return false;
    }
  }

  global.GoldspireBrowser = {
    api,
    runtime: api?.runtime,
    storage: api?.storage,
    tabs: api?.tabs,
    scripting: api?.scripting,
    contextMenus: api?.contextMenus,
    commands: api?.commands,
    storageGet,
    sendMessage,
    isValid,
    isInvalidatedError,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
