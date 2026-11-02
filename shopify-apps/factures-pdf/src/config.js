// Configuration lue dans les variables d'environnement (voir .env.example).

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const withHttps = (url) => (/^https?:\/\//.test(url) ? url : `https://${url}`).replace(/\/$/, '');

/** SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS → réglages nodemailer (plus simple que SMTP_URL). */
function smtpFromParts(env) {
  if (!env.SMTP_HOST) return '';
  const port = Number(env.SMTP_PORT || 587);
  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
  };
}

export function loadConfig(env = process.env) {
  const get = (name, fallback) => env[name] ?? fallback;
  return {
    // Shopify CLI (`shopify app dev`) fournit le port et l'URL du tunnel sous plusieurs noms.
    port: Number(env.PORT || env.FRONTEND_PORT || env.BACKEND_PORT || 3000),
    appUrl: withHttps(env.SHOPIFY_APP_URL || env.APP_URL || env.HOST || required('SHOPIFY_APP_URL')),
    apiKey: env.SHOPIFY_API_KEY ?? required('SHOPIFY_API_KEY'),
    apiSecret: env.SHOPIFY_API_SECRET ?? required('SHOPIFY_API_SECRET'),
    apiVersion: get('SHOPIFY_API_VERSION', '2026-10'),
    // Abonnements de test (aucun prélèvement) : obligatoire sur les boutiques de développement.
    billingTest: get('BILLING_TEST', 'true') !== 'false',
    // Adresse affichée dans la FAQ et l'aide (question « Comment contacter le support ? »).
    supportEmail: get('SUPPORT_EMAIL', ''),
    databasePath: get('DATABASE_PATH', './data/factures.sqlite'),
    // Chiffrement au repos (32 octets en base64 ou hexadécimal) : `npm run key` en génère une.
    dataEncryptionKey: get('DATA_ENCRYPTION_KEY', ''),
    // Sauvegardes automatiques chiffrées : dossier (idéalement un autre disque), rythme, durée.
    backup: {
      dir: get('BACKUP_DIR', ''),
      key: get('BACKUP_ENCRYPTION_KEY', ''),
      intervalHours: Number(get('BACKUP_INTERVAL_HOURS', 24)),
      retentionDays: Number(get('BACKUP_RETENTION_DAYS', 30)),
    },
    mail: {
      // smtp://user:pass@smtp.exemple.fr:587 ; "json" pour les tests (aucun envoi réel).
      transport: get('SMTP_URL', '') || smtpFromParts(env),
      from: get('MAIL_FROM', ''),
    },
  };
}
