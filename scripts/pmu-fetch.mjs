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
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Turf = require(path.join(ROOT, 'hippique/engine.js'));
const DATA = path.join(ROOT, 'hippique/data');
const API = process.env.PMU_API || 'https://online.turfinfo.api.pmu.fr/rest/client/1/programme/';
const KEEP_DAYS = 90; // journées détaillées conservées (servent aussi au calibrage)

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

// ---------------------------------------------------------------- performances détaillées
const TROT = /ATTELE|MONTE/i;
let loggedPlace = false;
function placeOf(me) {
  const p = me && me.place;
  if (p == null) return null;
  if (typeof p === 'number') return p;
  if (!loggedPlace) {
    loggedPlace = true;
    console.log('  (format place : ' + JSON.stringify(p) + ')');
  }
  const v = p.place ?? p.rang ?? p.classement ?? p.ordre;
  return typeof v === 'number' && v > 0 ? v : null;
}
/**
 * Résumé des courses précédentes d'un cheval, uniquement celles courues AVANT la
 * course analysée (aucune information postérieure n'est utilisée).
 */
function perfSummary(part, ctx) {
  const list = (part.coursesCourues || [])
    .filter((c) => c.date && c.date < ctx.dateMs - 3600000)
    .sort((a, b) => b.date - a.date);
  if (!list.length) return { nPerf: 0 };
  const out = { nPerf: list.length };
  out.repos = Math.round((ctx.dateMs - list[0].date) / 86400000);
  const sameGroup = (c) => TROT.test(c.discipline || '') === ctx.isTrot;
  const aptD = [0, 0],
    aptH = [0, 0],
    rks = [],
    allocs = [];
  list.slice(0, 10).forEach((c, k) => {
    const me = (c.participants || []).find((p) => p.itsHim);
    const pl = placeOf(me);
    const top3 = pl !== null && pl <= 3 ? 1 : 0;
    if (sameGroup(c) && ctx.distance && c.distance && Math.abs(c.distance - ctx.distance) <= 0.12 * ctx.distance) {
      aptD[0] += top3;
      aptD[1]++;
    }
    if (ctx.hippodrome && c.hippodrome && c.hippodrome.toUpperCase() === ctx.hippodrome.toUpperCase()) {
      aptH[0] += top3;
      aptH[1]++;
    }
    if (k < 5 && me && me.reductionKilometrique > 0 && sameGroup(c)) rks.push(me.reductionKilometrique);
    if (k < 5 && c.allocation > 0) allocs.push(Math.log(c.allocation));
  });
  if (aptD[1]) out.aptD = aptD;
  if (aptH[1]) out.aptH = aptH;
  if (rks.length) out.rk = Math.min(...rks);
  if (allocs.length) out.alloc = Math.round(Math.exp(allocs.reduce((a, b) => a + b, 0) / allocs.length));
  return out;
}

// ---------------------------------------------------------------- rapports définitifs
function parseRapports(list) {
  const out = { g: {}, p: {} };
  if (!Array.isArray(list)) return null;
  for (const t of list) {
    const type = t.typePari || '';
    const key = type === 'SIMPLE_GAGNANT' ? 'g' : type === 'SIMPLE_PLACE' ? 'p' : null;
    if (!key || Object.keys(out[key]).length) continue; // garde le premier enjeu (national)
    for (const r of t.rapports || []) {
      const div = r.dividendePourUnEuro ?? (r.dividende && t.miseBase ? (r.dividende * 100) / t.miseBase : null);
      if (div && r.combinaison) out[key][String(r.combinaison).trim()] = div / 100;
    }
  }
  return Object.keys(out.g).length || Object.keys(out.p).length ? out : null;
}

let loggedCourseKeys = false;
let sampled = false;
async function fetchDay(iso, prevDay, opts = {}) {
  const prog = await getJson(API + pmuDate(iso));
  const reunions = prog && prog.programme && prog.programme.reunions;
  if (!reunions) return null;
  const prev = {};
  for (const r of (prevDay && prevDay.reunions) || []) for (const c of r.courses) prev[r.r + '-' + c.c] = c;
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
      if (!loggedCourseKeys) {
        loggedCourseKeys = true;
        console.log('  (champs course : ' + Object.keys(c).join(',') + ')');
      }
      const course = {
        c: c.numOrdre || c.numExterne,
        libelle: c.libelle || c.libelleCourt || '',
        heure: c.heureDepart || null,
        distance: c.distance || '',
        discipline: discipline(c),
        terrain: terrain(c),
        allocation: c.montantPrix || c.montantTotalOffert || c.montantOffert1er || '',
        categorie: c.categorieParticularite || '',
        statut: c.statut || '',
        arrivee: arrivalOrder(c),
        partants: [],
      };
      reu.courses.push(course);
      jobs.push({ R, reu, course, old: prev[R + '-' + course.c] });
    }
  }
  const base = `${API}${pmuDate(iso)}`;
  await pool(jobs, 4, async ({ R, reu, course, old }) => {
    const tag = 'R' + R + 'C' + course.c;
    // Pronostic figé au départ : conservé tel quel, jamais recalculé.
    if (old && old.prono) course.prono = old.prono;
    // Mode rapide : seules les courses proches du départ (cotes) ou qui viennent de finir (rapports).
    if (opts.quick && old) {
      const now = Date.now();
      const soon = course.heure && course.heure > now - 20 * 60000 && course.heure < now + 2 * 3600000;
      const justFinished = course.arrivee && !old.rapports;
      if (!soon && !justFinished) {
        course.partants = old.partants || [];
        if (old.rapports) course.rapports = old.rapports;
        return;
      }
    }
    // Course terminée déjà complète : rien à retélécharger.
    if (old && old.rapports && old.partants && old.partants.length && course.arrivee) {
      course.partants = old.partants;
      course.rapports = old.rapports;
      return;
    }
    try {
      const j = await getJson(`${base}/R${R}/C${course.c}/participants`);
      if (j) {
        const runners = Turf.fromPmuParticipants(j);
        const raw = j.participants || [];
        course.partants = runners.map((x, i) => {
          const o = {};
          for (const k of Object.keys(x)) if (x[k] !== '' && x[k] !== false && x[k] != null) o[k] = x[k];
          if (raw[i] && raw[i].ordreArrivee) o.arrivee = raw[i].ordreArrivee;
          return o;
        });
        // Cote « au moment de parier » : dernière cote vue au moins 20 min avant le départ,
        // figée ensuite. La simulation de paris l'utilise à la place de la cote finale.
        const oldT = {};
        for (const p of (old && old.partants) || []) if (p.coteT != null) oldT[p.num] = p;
        const early = course.heure && course.heure - Date.now() >= 20 * 60000;
        for (const p of course.partants) {
          if (early && p.cote) {
            p.coteT = p.cote;
            p.coteTAt = Date.now();
          } else if (oldT[p.num]) {
            p.coteT = oldT[p.num].coteT;
            p.coteTAt = oldT[p.num].coteTAt;
          }
        }
        // Rapports probables au placé : on enregistre un exemplaire de la réponse (diagnostic).
        if (opts.quick && !sampled && !existsSync(path.join(DATA, '_sample-combinaisons.json')) && course.heure && course.heure - Date.now() < 30 * 60000) {
          sampled = true;
          try {
            const res = await fetch(`${base}/R${R}/C${course.c}/combinaisons?specialisation=INTERNET`, { headers: { accept: 'application/json' } });
            if (res.status === 200) {
              await writeFile(path.join(DATA, '_sample-combinaisons.json'), await res.text());
              console.log('  (exemplaire des rapports probables enregistré : ' + tag + ')');
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn('  ! ' + tag + ' partants : ' + e.message);
    }
    // Performances détaillées : une seule fois par course (elles ne changent pas).
    const oldPerf = {};
    for (const p of (old && old.partants) || []) if (p.nPerf != null) oldPerf[p.num] = p;
    if (course.partants.length && Object.keys(oldPerf).length) {
      for (const p of course.partants)
        if (oldPerf[p.num]) for (const k of PERF_KEYS) if (oldPerf[p.num][k] != null) p[k] = oldPerf[p.num][k];
    } else if (course.partants.length) {
      try {
        const pf = await getJson(`${base}/R${R}/C${course.c}/performances-detaillees/pretty`);
        const ctx = {
          dateMs: course.heure || Date.parse(iso + 'T12:00:00Z'),
          distance: Number(course.distance) || 0,
          hippodrome: reu.hippodrome,
          isTrot: /trot/.test(course.discipline),
        };
        const byNum = {};
        for (const part of (pf && pf.participants) || []) byNum[part.numPmu] = perfSummary(part, ctx);
        for (const p of course.partants) Object.assign(p, byNum[p.num] || { nPerf: 0 });
      } catch (e) {
        console.warn('  ! ' + tag + ' performances : ' + e.message);
      }
    }
    // Rapports définitifs (simple gagnant et simple placé), une fois l'arrivée connue.
    if (course.arrivee) {
      if (old && old.rapports) course.rapports = old.rapports;
      else
        try {
          course.rapports = parseRapports(await getJson(`${base}/R${R}/C${course.c}/rapports-definitifs`)) || undefined;
        } catch (e) {
          console.warn('  ! ' + tag + ' rapports : ' + e.message);
        }
    }
  });
  return day;
}
const PERF_KEYS = ['nPerf', 'repos', 'aptD', 'aptH', 'rk', 'alloc'];

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
  const args = process.argv.slice(2);
  const bi = args.indexOf('--backfill');
  const backfill = bi >= 0 ? Math.min(KEEP_DAYS, parseInt(args[bi + 1], 10) || 0) : 0;
  if (bi >= 0) args.splice(bi, 2);
  const qi = args.indexOf('--quick');
  const quick = qi >= 0;
  if (quick) args.splice(qi, 1);
  let dates = args.length ? args : quick ? [parisDate(0)] : [parisDate(-1), parisDate(0), parisDate(1)];
  // Historique : journées passées manquantes (servent au calibrage et à la simulation de paris).
  for (let k = backfill; k >= 2; k--) if (!dates.includes(parisDate(-k))) dates.unshift(parisDate(-k));
  const stats = await readJson(path.join(DATA, 'stats.json'), { dates: [], jockeys: {}, entraineurs: {}, chevaux: {} });

  let ok = 0;
  for (const iso of dates) {
    console.log('Programme du ' + iso);
    let day;
    try {
      const prevDay = await readJson(path.join(DATA, iso + '.json'), null);
      if (prevDay && iso < parisDate(-1) && prevDay.complete) {
        console.log('  déjà complète');
        continue;
      }
      day = await fetchDay(iso, prevDay, { quick: quick && !!prevDay });
    } catch (e) {
      console.warn('  ! ' + e.message);
      continue;
    }
    if (!day) {
      console.log('  (pas de programme)');
      continue;
    }
    ok++;
    const all = day.reunions.flatMap((r) => r.courses);
    day.complete = finished(day) && all.every((c) => !c.arrivee || c.rapports);
    console.log(
      `  ${day.reunions.length} réunions, ${all.length} courses, ${all.filter((c) => c.rapports).length} avec rapports, ` +
        `${all.filter((c) => c.partants.some((p) => p.nPerf != null)).length} avec performances`,
    );
    // Contrôle de cohérence : un programme sans aucun partant signale un changement de l'API.
    const nPart = all.reduce((n, c) => n + c.partants.length, 0);
    if (all.length >= 5 && nPart === 0) {
      console.error('  ! aucun partant récupéré : l\'API du PMU a peut-être changé');
      process.exitCode = 1;
      continue;
    }
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
