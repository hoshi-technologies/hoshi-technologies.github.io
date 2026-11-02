// Ouverture de la base sur Node (node:sqlite). Sur Cloudflare, voir worker.js.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createStore } from './db.js';
import { nodeSql } from './sql.js';

export { truncateIp, createStore } from './db.js';

/**
 * @param path  fichier SQLite, ou ':memory:'
 * @param key   clé de chiffrement de 32 octets (Buffer) ; obligatoire pour un fichier,
 *              aléatoire pour une base en mémoire (tests, démo)
 */
export function openDatabase(path, { key } = {}) {
  if (!key && path !== ':memory:') throw new Error('Clé de chiffrement manquante pour la base de données.');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  return createStore(nodeSql(new DatabaseSync(path)), key);
}
