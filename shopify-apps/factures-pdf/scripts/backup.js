// Sauvegarde manuelle : `npm run backup` (mêmes variables que le serveur : DATABASE_PATH,
// BACKUP_DIR, DATA_ENCRYPTION_KEY ou BACKUP_ENCRYPTION_KEY, SHOPIFY_API_SECRET).
import { DatabaseSync } from 'node:sqlite';
import { createBackup, listBackups } from '../src/backup.js';
import { resolveKey } from '../src/crypto.js';

const env = process.env;
const dir = env.BACKUP_DIR;
if (!dir) throw new Error('BACKUP_DIR manquant');
const key = resolveKey({ key: env.BACKUP_ENCRYPTION_KEY || env.DATA_ENCRYPTION_KEY, fallbackSecret: env.SHOPIFY_API_SECRET });
const db = new DatabaseSync(env.DATABASE_PATH || './data/factures.sqlite');
console.log(`Sauvegarde : ${createBackup(db, { dir, key, retentionDays: Number(env.BACKUP_RETENTION_DAYS || 30) })}`);
console.log(`${listBackups(dir).length} sauvegarde(s) conservée(s) dans ${dir}`);
