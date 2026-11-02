// Point d'entrée du serveur : `npm start` (production) ou `npm run dev` (Shopify CLI).

import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createTransport } from './mailer.js';
import { InvoiceService } from './service.js';
import { createApp } from './server.js';
import { resolveKey } from './crypto.js';
import { createBackup } from './backup.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`\nHoshi Factures ne peut pas démarrer : ${error.message}`);
  console.error('Lancez l’appli avec `shopify app dev`, ou renseignez le fichier .env (voir .env.example).\n');
  process.exit(1);
}

if (!config.dataEncryptionKey) {
  console.warn('DATA_ENCRYPTION_KEY absent : clé de chiffrement dérivée du secret de l’appli (à définir en production, voir `npm run key`).');
}
const dataKey = resolveKey({ key: config.dataEncryptionKey, fallbackSecret: config.apiSecret });
const store = openDatabase(config.databasePath, { key: dataKey });
const service = new InvoiceService({
  store,
  transport: createTransport(config.mail.transport),
  mailFrom: config.mail.from,
});
if (!service.transport) console.warn('SMTP_URL absent : les factures seront créées mais pas envoyées par e-mail.');

createApp({ config, store, service }).listen(config.port, () => {
  console.log(`Hoshi Factures à l'écoute sur le port ${config.port} (${config.appUrl})`);
});

// Tâches de fond : purge du journal des accès (12 mois) et sauvegardes chiffrées.
const daily = () => store.purgeAccessLog(365);
daily();
setInterval(daily, 24 * 3600e3).unref();

if (config.backup.dir) {
  const backupKey = resolveKey({ key: config.backup.key || config.dataEncryptionKey, fallbackSecret: config.apiSecret });
  const backup = () => {
    try {
      const file = createBackup(store.db, { dir: config.backup.dir, key: backupKey, retentionDays: config.backup.retentionDays });
      console.log(`Sauvegarde chiffrée : ${file}`);
    } catch (error) {
      console.error(`Sauvegarde impossible : ${error.message}`);
    }
  };
  setTimeout(backup, 60e3).unref(); // première sauvegarde une minute après le démarrage
  setInterval(backup, config.backup.intervalHours * 3600e3).unref();
} else {
  console.warn('BACKUP_DIR absent : pas de sauvegarde automatique (obligatoire en production).');
}
