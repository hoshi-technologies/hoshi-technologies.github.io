// Point d'entrée du serveur : `npm start` (production) ou `npm run dev` (Shopify CLI).

import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createTransport } from './mailer.js';
import { InvoiceService } from './service.js';
import { createApp } from './server.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`\nHoshi Factures ne peut pas démarrer : ${error.message}`);
  console.error('Lancez l’appli avec `shopify app dev`, ou renseignez le fichier .env (voir .env.example).\n');
  process.exit(1);
}

const store = openDatabase(config.databasePath);
const service = new InvoiceService({
  store,
  transport: createTransport(config.mail.transport),
  mailFrom: config.mail.from,
});
if (!service.transport) console.warn('SMTP_URL absent : les factures seront créées mais pas envoyées par e-mail.');

createApp({ config, store, service }).listen(config.port, () => {
  console.log(`Hoshi Factures à l'écoute sur le port ${config.port} (${config.appUrl})`);
});
