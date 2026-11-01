#!/usr/bin/env node
/*
 * Récupère automatiquement le programme PMU (réunions, courses, partants, cotes,
 * arrivées) et l'enregistre dans hippique/data/ pour la page Hoshi Turf.
 *
 *   node scripts/pmu-fetch.mjs            → hier, aujourd'hui et demain (heure de Paris)
 *   node scripts/pmu-fetch.mjs 2026-11-01 → une ou plusieurs dates précises
 *
 * Fichiers produits :
 *   hippique/data/AAAA-MM-JJ.json  programme complet d'une journée
 *   hippique/data/index.json       liste des journées disponibles
 *   hippique/data/stats.json       statistiques jockeys/drivers, entraîneurs, dernières sorties
 *                                  (calculées à partir des arrivées archivées)
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Turf = require(path.join(ROOT, 'hippique/engine.js'));
const DATA = path.join(ROOT, 'hippique/data');
const API = process.env.PMU_API || 'https://online.turfinfo.api.pmu.fr/rest/client/1/programme/';
const KEEP_DAYS = 45; // journées détaillées conservées (les statistiques, elles, sont cumulées)

// ---------------------------------------------------------------- dates
function parisDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ
}
const pmuDate = (iso) => iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4);

// ---------------------------------------------------------------- réseau
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'hoshi-turf/1.0' } });
      if (res.status === 204 || res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i >= tries) throw new Error(url + ' : ' + e.message);
      await sleep(1000 * 2 ** i);
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let k = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < items.length) {
        const i = k++;
        out[i] = await fn(items[i]);
        await sleep(120);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- conversion
function discipline(c) {
  const s = `${c.specialite || ''} ${c.discipline || ''}`.toUpperCase();
  if (s.includes('ATTELE')) return 'trot attelé';
  if (s.includes('MONTE')) return 'trot monté';
  if (/HAIE|STEEPLE|CROSS|OBSTACLE/.test(s)) return 'obstacle';
  return 'plat';
}
function terrain(c) {
  const p = c.penetrometre || {};
  return p.intitule || p.libelle || '';
}
function arrivalOrder(c) {
  // ordreArrivee : [[n°], [n°, n°] (ex aequo), ...]
  return Array.isArray(c.ordreArrivee) ? c.ordreArrivee.map((g) => (Array.isArray(g) ? g : [g])) : null;
}

async function fetchDay(iso) {
  const prog = await getJson(API + pmuDate(iso));
  const reunions = prog && prog.programme && prog.programme.reunions;
  if (!reunions) return null;
  const jobs = [];
  const day = { date: iso, updated: new Date().toISOString(), reunions: [] };
  for (const r of reunions) {
    const R = r.numOfficiel || r.numExterne;
    const reu = {
      r: R,
      hippodrome: (r.hippodrome && (r.hippodrome.libelleCourt || r.hippodrome.libelleLong)) || '',
      pays: (r.pays && r.pays.code) || '',
      courses: [],
    };
    day.reunions.push(reu);
    for (const c of r.courses || []) {
      const course = {
        c: c.numOrdre || c.numExterne,
        libelle: c.libelle || c.libelleCourt || '',
        heure: c.heureDepart || null,
        distance: c.distance || '',
        discipline: discipline(c),
        terrain: terrain(c),
        statut: c.statut || '',
        arrivee: arrivalOrder(c),
        partants: [],
      };
      reu.courses.push(course);
      jobs.push({ R, course });
    }
  }
  await pool(jobs, 4, async ({ R, course }) => {
    try {
      const j = await getJson(`${API}${pmuDate(iso)}/R${R}/C${course.c}/participants`);
      if (!j) return;
      const runners = Turf.fromPmuParticipants(j);
      const raw = j.participants || [];
      course.partants = runners.map((x, i) => {
        const o = {};
        for (const k of Object.keys(x)) if (x[k] !== '' && x[k] !== false && x[k] != null) o[k] = x[k];
        if (raw[i] && raw[i].ordreArrivee) o.arrivee = raw[i].ordreArrivee;
        return o;
      });
    } catch (e) {
      console.warn('  ! R' + R + 'C' + course.c + ' : ' + e.message);
    }
  });
  return day;
}

// ---------------------------------------------------------------- statistiques
function addStat(map, name, won, placed) {
  if (!name) return;
  const s = (map[name] ||= [0, 0, 0]); // [courses, victoires, places (1-3)]
  s[0]++;
  if (won) s[1]++;
  if (placed) s[2]++;
}
function finished(day) {
  return day.reunions.every((r) => r.courses.every((c) => c.arrivee || /ANNUL/i.test(c.statut) || !c.partants.length));
}
function updateStats(stats, day) {
  if (stats.dates.includes(day.date) || !finished(day)) return false;
  for (const r of day.reunions)
    for (const c of r.courses) {
      const rank = {};
      (c.arrivee || []).forEach((g, k) => g.forEach((n) => (rank[n] = k + 1)));
      if (!c.arrivee) continue;
      for (const p of c.partants) {
        if (p.nonPartant) continue;
        const pos = p.arrivee || rank[p.num] || 99;
        addStat(stats.jockeys, p.jockeyNom, pos === 1, pos <= 3);
        addStat(stats.entraineurs, p.entraineurNom, pos === 1, pos <= 3);
        if (!stats.chevaux[p.nom] || stats.chevaux[p.nom] < day.date) stats.chevaux[p.nom] = day.date;
      }
    }
  stats.dates.push(day.date);
  stats.dates.sort();
  return true;
}

// ---------------------------------------------------------------- principal
async function readJson(f, dflt) {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return dflt;
  }
}
async function main() {
  await mkdir(DATA, { recursive: true });
  const dates = process.argv.slice(2).length ? process.argv.slice(2) : [parisDate(-1), parisDate(0), parisDate(1)];
  const stats = await readJson(path.join(DATA, 'stats.json'), { dates: [], jockeys: {}, entraineurs: {}, chevaux: {} });

  let ok = 0;
  for (const iso of dates) {
    console.log('Programme du ' + iso);
    let day;
    try {
      day = await fetchDay(iso);
    } catch (e) {
      console.warn('  ! ' + e.message);
      continue;
    }
    if (!day) {
      console.log('  (pas de programme)');
      continue;
    }
    ok++;
    const n = day.reunions.reduce((s, r) => s + r.courses.length, 0);
    console.log(`  ${day.reunions.length} réunions, ${n} courses`);
    await writeFile(path.join(DATA, iso + '.json'), JSON.stringify(day));
    if (iso < parisDate(0) && updateStats(stats, day)) console.log('  statistiques mises à jour');
  }

  // Ménage : journées trop anciennes, chevaux non revus depuis un an.
  const limit = parisDate(-KEEP_DAYS);
  const files = (await readdir(DATA)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  for (const f of files) if (f.slice(0, 10) < limit) await unlink(path.join(DATA, f));
  const yearAgo = parisDate(-365);
  for (const k of Object.keys(stats.chevaux)) if (stats.chevaux[k] < yearAgo) delete stats.chevaux[k];
  stats.dates = stats.dates.filter((d) => d >= yearAgo);
  stats.updated = new Date().toISOString();
  await writeFile(path.join(DATA, 'stats.json'), JSON.stringify(stats));

  const days = (await readdir(DATA))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
  await writeFile(path.join(DATA, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), days }));

  if (!ok) {
    console.error('Aucune journée récupérée.');
    process.exitCode = 1;
  }
}
main();
