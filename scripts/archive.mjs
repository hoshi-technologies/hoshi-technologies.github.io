/*
 * Archive des journées de courses (historique long), utilisée par le calibrage.
 *
 * Une journée = un fichier compressé hippique/data/archive/AAAA/AAAA-MM-JJ.json.gz, écrit
 * une seule fois (même contenu qu'un fichier du jour). Un fichier par journée : la boucle de
 * mise à jour et la récupération de l'historique n'écrivent jamais le même fichier.
 */
import { gzipSync, gunzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARCHIVE = process.env.ARCHIVE_DIR || path.join(ROOT, 'hippique/data/archive');

export const archivePath = (iso) => path.join(ARCHIVE, iso.slice(0, 4), iso + '.json.gz');
export const hasArchive = (iso) => existsSync(archivePath(iso));

/** Archive une journée (ne réécrit pas une journée déjà archivée, sauf `force`). */
export async function writeArchiveDay(day, force = false) {
  const f = archivePath(day.date);
  if (!force && existsSync(f)) return false;
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, gzipSync(JSON.stringify(day), { level: 9 }));
  return true;
}

export async function readArchiveDay(iso) {
  try {
    return JSON.parse(gunzipSync(await readFile(archivePath(iso))).toString('utf8'));
  } catch {
    return null;
  }
}

/** Dates archivées, triées. */
export async function archiveDates() {
  const out = [];
  let years = [];
  try {
    years = (await readdir(ARCHIVE)).filter((y) => /^\d{4}$/.test(y));
  } catch {
    return out;
  }
  for (const y of years)
    for (const f of await readdir(path.join(ARCHIVE, y))) if (/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)) out.push(f.slice(0, 10));
  return out.sort();
}
