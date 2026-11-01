// Configuration lue dans les variables d'environnement (voir .env.example).

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export function loadConfig(env = process.env) {
  const get = (name, fallback) => env[name] ?? fallback;
  return {
    port: Number(get('PORT', 3000)),
    appUrl: (env.SHOPIFY_APP_URL ?? required('SHOPIFY_APP_URL')).replace(/\/$/, ''),
    apiKey: env.SHOPIFY_API_KEY ?? required('SHOPIFY_API_KEY'),
    apiSecret: env.SHOPIFY_API_SECRET ?? required('SHOPIFY_API_SECRET'),
    apiVersion: get('SHOPIFY_API_VERSION', '2026-10'),
    databasePath: get('DATABASE_PATH', './data/factures.sqlite'),
    mail: {
      // smtp://user:pass@smtp.exemple.fr:587 ; "json" pour les tests (aucun envoi réel).
      transport: get('SMTP_URL', ''),
      from: get('MAIL_FROM', ''),
    },
  };
}
