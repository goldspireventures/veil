/**
 * Client-side encryption for inline secured text.
 * AES-256-GCM with PBKDF2 — nothing leaves the browser.
 */
(function (global) {
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const MAX_PASSPHRASE_LENGTH = 256;
  const MAX_PLAINTEXT_LENGTH = 4096;
  const MAX_PAYLOAD_BYTES = 64 * 1024;
  const ONE_TIME_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ITERATIONS = {
    personal: 310_000,
    organization: 600_000,
  };

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function concatBytes(...parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.length;
    }
    return merged;
  }

  function getIterations(profile = 'personal') {
    return ITERATIONS[profile] || ITERATIONS.personal;
  }

  function validatePassphrase(passphrase, profile = 'personal') {
    const minLength = profile === 'organization' ? 12 : 8;
    if (!passphrase || passphrase.length < minLength) {
      throw new Error(`Passphrase must be at least ${minLength} characters.`);
    }
    if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
      throw new Error('Passphrase is too long.');
    }
  }

  function validatePlaintext(plaintext) {
    if (!plaintext || !plaintext.trim()) {
      throw new Error('Nothing to secure.');
    }
    if (plaintext.length > MAX_PLAINTEXT_LENGTH) {
      throw new Error('Text is too long to secure inline.');
    }
  }

  function generateOneTimeCode(length = 16) {
    const limit = Math.floor(256 / ONE_TIME_CHARS.length) * ONE_TIME_CHARS.length;
    const chars = [];
    while (chars.length < length) {
      const batch = crypto.getRandomValues(new Uint8Array(length * 2));
      for (const byte of batch) {
        if (byte >= limit) continue;
        chars.push(ONE_TIME_CHARS[byte % ONE_TIME_CHARS.length]);
        if (chars.length >= length) break;
      }
    }
    return chars.join('');
  }

  async function deriveKey(passphrase, salt, profile = 'personal') {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: getIterations(profile),
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  function packEnvelope(plaintext, options = {}) {
    return JSON.stringify({
      v: 2,
      t: plaintext,
      mode: options.mode || 'team',
      exp: options.expiresAt || null,
      created: Date.now(),
    });
  }

  function unpackEnvelope(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.t === 'string') {
        return parsed;
      }
    } catch {
      // Legacy payloads stored plaintext directly.
    }
    return { v: 1, t: raw, mode: 'team', exp: null, created: null };
  }

  async function encryptText(plaintext, passphrase, options = {}) {
    const profile = options.profile || 'personal';
    validatePlaintext(plaintext);
    validatePassphrase(passphrase, options.mode === 'one-time' ? 'personal' : profile);

    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(passphrase, salt, profile);
    const encoder = new TextEncoder();
    const aad = encoder.encode(`gs|v2|${options.mode || 'team'}`);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      key,
      encoder.encode(packEnvelope(plaintext, options)),
    );

    return bytesToBase64Url(concatBytes(salt, iv, new Uint8Array(ciphertext)));
  }

  async function decryptText(payload, passphrase, options = {}) {
    const profile = options.profile || 'personal';
    validatePassphrase(passphrase, profile);

    const bytes = base64UrlToBytes(payload);
    if (bytes.length < SALT_BYTES + IV_BYTES + 16 || bytes.length > MAX_PAYLOAD_BYTES) {
      throw new Error('Invalid secured text.');
    }

    const salt = bytes.slice(0, SALT_BYTES);
    const iv = bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const ciphertext = bytes.slice(SALT_BYTES + IV_BYTES);
    const key = await deriveKey(passphrase, salt, profile);

    const modes = ['team', 'custom', 'one-time'];
    let envelope = null;
    let lastError = null;

    for (const mode of modes) {
      try {
        const aad = new TextEncoder().encode(`gs|v2|${mode}`);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, ciphertext);
        envelope = unpackEnvelope(new TextDecoder().decode(decrypted));
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!envelope) {
      try {
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        envelope = unpackEnvelope(new TextDecoder().decode(decrypted));
      } catch {
        throw new Error('Wrong passphrase or corrupted secured text.');
      }
    }

    if (envelope.exp && Date.now() > envelope.exp) {
      throw new Error('This secured text has expired.');
    }

    return envelope.t;
  }

  global.GoldspireSecureCrypto = {
    encryptText,
    decryptText,
    generateOneTimeCode,
    unpackEnvelope,
    validatePassphrase,
    validatePlaintext,
    getIterations,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
