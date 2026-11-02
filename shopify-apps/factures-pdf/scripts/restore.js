// Restauration : `npm run restore -- <sauvegarde.sqlite.gz.enc> <base-restauree.sqlite>`
// Arrêtez le serveur, restaurez vers un nouveau fichier, vérifiez, puis remplacez DATABASE_PATH.
import { restoreBackup } from '../src/backup.js';
import { resolveKey } from '../src/crypto.js';

const [file, target] = process.argv.slice(2);
if (!file || !target) throw new Error('Usage : npm run restore -- <sauvegarde> <base-restauree.sqlite>');
const env = process.env;
const key = resolveKey({ key: env.BACKUP_ENCRYPTION_KEY || env.DATA_ENCRYPTION_KEY, fallbackSecret: env.SHOPIFY_API_SECRET });
const { invoices } = restoreBackup(file, target, { key });
console.log(`Base restaurée dans ${target} : intégrité vérifiée, ${invoices} facture(s).`);
