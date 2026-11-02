// Sauvegardes de la base : copie cohérente (VACUUM INTO), compressée (gzip), chiffrée
// (AES-256-GCM), conservée N jours. La restauration fait l'inverse.
//
// Fichier : factures-AAAAMMJJ-HHMMSS.sqlite.gz.enc = "HFB1" + iv | tag | données chiffrées.

import { mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { createCipher } from './crypto.js';

const MAGIC = Buffer.from('HFB1');
const NAME = /^factures-\d{8}-\d{6}\.sqlite\.gz\.enc$/;

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
}

/** Crée une sauvegarde chiffrée de la base ouverte `db` dans `dir`. Renvoie le chemin. */
export function createBackup(db, { dir, key, retentionDays = 30, now = new Date() }) {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.tmp-${process.pid}-${Date.now()}.sqlite`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const packed = createCipher(key).encryptBuffer(gzipSync(readFileSync(tmp)));
    const file = join(dir, `factures-${stamp(now)}.sqlite.gz.enc`);
    writeFileSync(file, Buffer.concat([MAGIC, packed]), { mode: 0o600 });
    pruneBackups(dir, retentionDays, now);
    return file;
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

/** Supprime les sauvegardes plus anciennes que `retentionDays` jours. */
export function pruneBackups(dir, retentionDays, now = new Date()) {
  const limit = now.getTime() - retentionDays * 864e5;
  const removed = [];
  for (const name of readdirSync(dir)) {
    if (!NAME.test(name)) continue;
    const path = join(dir, name);
    if (statSync(path).mtimeMs < limit) {
      unlinkSync(path);
      removed.push(name);
    }
  }
  return removed;
}

export function listBackups(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((n) => NAME.test(n)).sort() : [];
}

/** Déchiffre une sauvegarde vers `target` (fichier SQLite) et vérifie son intégrité. */
export function restoreBackup(file, target, { key }) {
  const raw = readFileSync(file);
  if (!raw.subarray(0, 4).equals(MAGIC)) throw new Error('Ce fichier n’est pas une sauvegarde Hoshi Factures.');
  const sqlite = gunzipSync(createCipher(key).decryptBuffer(raw.subarray(4)));
  writeFileSync(target, sqlite, { mode: 0o600 });
  const db = new DatabaseSync(target);
  try {
    const { integrity_check: check } = db.prepare('PRAGMA integrity_check').get();
    if (check !== 'ok') throw new Error(`Base restaurée corrompue : ${check}`);
    return { invoices: db.prepare('SELECT COUNT(*) AS n FROM invoices').get().n };
  } finally {
    db.close();
  }
}
