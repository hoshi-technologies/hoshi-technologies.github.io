#!/usr/bin/env node
/*
 * Récupération de l'historique PMU, le plus loin possible dans le passé.
 *
 * Remonte le temps jour après jour à partir de la plus ancienne journée connue (archive ou
 * dossier du site) et archive chaque journée terminée (hippique/data/archive/). S'arrête
 * quand le PMU n'a plus de programme pendant EMPTY_STOP jours d'affilée : l'historique est
 * alors complet (état dans hippique/data/archive/state.json).
 *
 *   node scripts/pmu-history.mjs --minutes 40   → travaille au plus 40 minutes puis s'arrête
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDay, finished } from './pmu-fetch.mjs';
import { ARCHIVE, archiveDates, hasArchive, writeArchiveDay } from './archive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'hippique/data');
const STATE = path.join(ARCHIVE, 'state.json');
const EMPTY_STOP = 60; // jours consécutifs sans programme → plus rien avant
const FLOOR = '2005-01-01'; // garde-fou
const args = process.argv.slice(2);
const mi = args.indexOf('--minutes');
const MINUTES = mi >= 0 ? Number(args[mi + 1]) || 40 : 40;

const prevIso = (iso) => new Date(Date.parse(iso + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
const readJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return d;
  }
};

async function main() {
  await mkdir(ARCHIVE, { recursive: true });
  const state = await readJson(STATE, { done: false, emptyStreak: 0, days: 0, courses: 0, errors: 0 });
  if (state.done) {
    console.log(`Historique complet : rien avant le ${state.oldest}.`);
    return;
  }
  const site = (await readdir(DATA)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10));
  const arch = await archiveDates();
  const known = [...site, ...arch, state.cursor].filter(Boolean).sort();
  let iso = prevIso(known[0]);
  const t0 = Date.now();
  let n = 0;
  console.log(`Historique : départ du ${iso} (plus ancienne journée connue : ${known[0]}).`);
  while (Date.now() - t0 < MINUTES * 60000 && iso >= FLOOR) {
    if (hasArchive(iso)) {
      iso = prevIso(iso);
      continue;
    }
    let day = null;
    try {
      day = await fetchDay(iso, null);
    } catch (e) {
      // Panne passagère : on réessaiera ce jour au prochain passage.
      console.warn(`  ! ${iso} : ${e.message}`);
      state.errors++;
      break;
    }
    const all = day ? day.reunions.flatMap((r) => r.courses) : [];
    if (!day || !all.length) {
      state.emptyStreak++;
      console.log(`  ${iso} : pas de programme (${state.emptyStreak} jour(s) d'affilée)`);
      if (state.emptyStreak >= EMPTY_STOP) {
        state.done = true;
        break;
      }
    } else {
      state.emptyStreak = 0;
      day.complete = finished(day);
      day.archivedFrom = 'history';
      await writeArchiveDay(day);
      state.oldest = iso;
      state.days++;
      state.courses += all.length;
      n++;
      const wr = all.filter((c) => c.rapports).length;
      console.log(`  ${iso} : ${day.reunions.length} réunions, ${all.length} courses, ${wr} avec rapports`);
    }
    state.cursor = iso;
    iso = prevIso(iso);
  }
  state.updated = new Date().toISOString();
  await writeFile(STATE, JSON.stringify(state, null, 1));
  console.log(`${n} journée(s) archivée(s) ce passage · total ${state.days} journées, ${state.courses} courses · plus ancienne : ${state.oldest || '—'}${state.done ? ' · HISTORIQUE COMPLET' : ''}`);
}
main();
