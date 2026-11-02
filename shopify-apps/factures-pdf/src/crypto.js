// Chiffrement au repos des données personnelles (AES-256-GCM, authentifié).
// Valeur chiffrée : "enc:v1:" + base64(iv 12 octets | tag 16 octets | données).
// Une valeur sans ce préfixe est lue telle quelle (bases créées avant le chiffrement).

import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';

const PREFIX = 'enc:v1:';

/**
 * Clé de 32 octets : DATA_ENCRYPTION_KEY (base64 ou hexadécimal), sinon dérivée du secret de
 * l'appli Shopify (HKDF). La clé explicite est recommandée en production : elle ne change pas
 * si le secret de l'appli est renouvelé.
 */
export function resolveKey({ key, fallbackSecret } = {}) {
  if (key) {
    const raw = /^[0-9a-f]{64}$/i.test(key) ? Buffer.from(key, 'hex') : Buffer.from(key, 'base64');
    if (raw.length !== 32) throw new Error('DATA_ENCRYPTION_KEY doit faire 32 octets (64 caractères hexadécimaux ou base64).');
    return raw;
  }
  if (fallbackSecret) return Buffer.from(hkdfSync('sha256', fallbackSecret, 'hoshi-factures', 'data-at-rest-v1', 32));
  throw new Error('Aucune clé de chiffrement : renseignez DATA_ENCRYPTION_KEY.');
}

export const generateKey = () => randomBytes(32).toString('base64');

export function createCipher(key) {
  const encryptBuffer = (plain) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  };
  const decryptBuffer = (packed) => {
    const decipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]);
  };
  const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

  return {
    encryptBuffer,
    decryptBuffer,
    /** Texte ou octets → chaîne chiffrée ; null et undefined restent null. */
    encrypt(value) {
      if (value === null || value === undefined) return null;
      const plain = Buffer.isBuffer(value) || value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(String(value), 'utf8');
      return PREFIX + encryptBuffer(plain).toString('base64');
    },
    decryptText(value) {
      if (!isEncrypted(value)) return value;
      return decryptBuffer(Buffer.from(value.slice(PREFIX.length), 'base64')).toString('utf8');
    },
    decryptBytes(value) {
      if (value === null || value === undefined) return value;
      if (!isEncrypted(value)) return Buffer.from(value);
      return decryptBuffer(Buffer.from(value.slice(PREFIX.length), 'base64'));
    },
    isEncrypted,
  };
}
