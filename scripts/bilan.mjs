#!/usr/bin/env node
/*
 * Bilan des pronostics Hoshi Turf, jour par jour.
 *
 * Ne compte que les courses dont le pronostic a été FIGÉ avant le départ (course.prono)
 * et dont l'arrivée est connue : c'est le bilan de ce qui était réellement annoncé.
 * Produit hippique/data/bilan.json (totaux, par jour, et détail des 14 derniers jours).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'hippique/data');
const DETAIL_DAYS = 14;
const DRIFT_WINDOW = Number(process.env.DRIFT_WINDOW) || 100; // courses récentes surveillées
const DRIFT_Z = 2; // écart significatif (en écarts-types)
const TOPIC = (process.env.NTFY_TOPIC || '').trim();
const PAGE = 'https://hoshi-technologies.github.io/hippique/';
const readJson = async (f) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return null;
  }
};

function emptyAgg() {
  return {
    courses: 0, // courses comptées
    topPlaced: 0, // notre n°1 placé (règle PMU)
    topWon: 0, // notre n°1 gagnant
    expectedPlaced: 0, // somme des probabilités annoncées pour notre n°1
    podium: 0, // nombre de chevaux de notre trio dans les 3 premiers
    favPlaced: 0, // favori des cotes placé
    favCourses: 0,
    stakeP: 0, // 1 € placé sur notre n°1
    returnP: 0,
    stakeG: 0, // 1 € gagnant sur notre n°1
    returnG: 0,
    selCourses: 0, // courses de la sélection ⭐
    selPlaced: 0,
    selStake: 0,
    selReturn: 0,
  };
}
function add(a, b) {
  for (const k of Object.keys(a)) a[k] += b[k] || 0;
}

/** Résultat d'une course : null si elle ne peut pas être comptée. */
function scoreCourse(reu, c) {
  if (!c.prono || !c.arrivee || !c.partants || !c.partants.length) return null;
  const pos = {};
  c.arrivee.forEach((g, k) => (Array.isArray(g) ? g : [g]).forEach((n) => (pos[String(n)] = k + 1)));
  for (const p of c.partants) if (p.arrivee) pos[String(p.num)] = p.arrivee;
  const np = new Set(c.partants.filter((p) => p.nonPartant).map((p) => String(p.num)));
  const runners = c.prono.runners.filter((r) => !np.has(String(r.num)));
  if (runners.length < 2) return null;
  const nPlaces = c.prono.placesPayees || 3;
  const pp = (r) => (r.pPlace != null ? r.pPlace : r.pTop3);
  const byPlace = runners.slice().sort((a, b) => pp(b) - pp(a));
  const top = byPlace[0];
  const posOf = (r) => pos[String(r.num)] || 99;
  const trio = runners
    .slice()
    .sort((a, b) => b.pTop3 - a.pTop3)
    .slice(0, 3);
  const withCote = runners.filter((r) => r.cote);
  const fav = withCote.length ? withCote.reduce((b, r) => (r.cote < b.cote ? r : b)) : null;
  const rp = (c.rapports && c.rapports.p) || {};
  const rg = (c.rapports && c.rapports.g) || {};
  const placed = posOf(top) <= nPlaces;
  const o = emptyAgg();
  o.courses = 1;
  o.topPlaced = placed ? 1 : 0;
  o.topWon = posOf(top) === 1 ? 1 : 0;
  o.expectedPlaced = pp(top);
  o.podium = trio.filter((r) => posOf(r) <= 3).length;
  if (fav) (o.favCourses = 1), (o.favPlaced = posOf(fav) <= nPlaces ? 1 : 0);
  if (c.rapports && c.prono.placesPayees) (o.stakeP = 1), (o.returnP = rp[String(top.num)] || 0);
  if (c.rapports) (o.stakeG = 1), (o.returnG = rg[String(top.num)] || 0);
  if (c.prono.selected) {
    o.selCourses = 1;
    o.selPlaced = placed ? 1 : 0;
    if (o.stakeP) (o.selStake = 1), (o.selReturn = o.returnP);
  }
  const partant = c.partants.find((p) => String(p.num) === String(top.num)) || {};
  return {
    agg: o,
    fr: !reu.pays || reu.pays === 'FRA',
    detail: {
      r: reu.r,
      c: c.c,
      heure: c.heure,
      hippodrome: reu.hippodrome,
      pays: reu.pays || '',
      top: { num: top.num, nom: partant.nom || '', p: +pp(top).toFixed(3), cote: top.cote || null, pos: posOf(top) },
      arrivee: Object.entries(pos)
        .filter(([, v]) => v <= 3)
        .sort((a, b) => a[1] - b[1])
        .map(([n]) => n),
      placed,
      rapportP: rp[String(top.num)] || 0,
      podium: o.podium,
      selected: !!c.prono.selected,
    },
  };
}

/**
 * Alerte de dérive : sur les DRIFT_WINDOW dernières courses figées, compare le nombre de n°1
 * placés au nombre annoncé par nos probabilités. Un écart de plus de DRIFT_Z écarts-types
 * déclenche une notification (au plus une par semaine et par sens).
 */
async function checkDrift(recent, prev) {
  const last = recent.slice(-DRIFT_WINDOW);
  const drift = { courses: last.length, window: DRIFT_WINDOW, lastAlert: (prev && prev.drift && prev.drift.lastAlert) || {} };
  if (last.length < DRIFT_WINDOW) return drift;
  const obs = last.filter((x) => x.placed).length;
  const exp = last.reduce((a, x) => a + x.p, 0);
  const sd = Math.sqrt(last.reduce((a, x) => a + x.p * (1 - x.p), 0)) || 1;
  const z = (obs - exp) / sd;
  Object.assign(drift, { observed: obs, expected: +exp.toFixed(1), z: +z.toFixed(2) });
  const dir = z <= -DRIFT_Z ? 'bas' : z >= DRIFT_Z ? 'haut' : null;
  if (!dir) return drift;
  const lastAt = drift.lastAlert[dir];
  if (lastAt && Date.now() - new Date(lastAt) < 7 * 86400000) return drift;
  const title = dir === 'bas' ? '⚠️ Hoshi Turf : le modèle se trompe plus que prévu' : 'ℹ️ Hoshi Turf : le modèle est trop prudent';
  const msg =
    `Sur les ${DRIFT_WINDOW} dernières courses, notre n°1 a été placé ${obs} fois pour ${exp.toFixed(0)} annoncées. ` +
    (dir === 'bas'
      ? 'Les pourcentages affichés sont trop optimistes en ce moment : prudence, et demandez une analyse.'
      : 'Les pourcentages affichés sont trop pessimistes : le recalibrage quotidien devrait corriger.');
  console.log('DÉRIVE ' + title + ' — ' + msg);
  if (TOPIC) {
    await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: TOPIC, title, message: msg, tags: ['chart_with_downwards_trend'], priority: 4, click: PAGE }),
    }).catch(() => {});
  }
  drift.lastAlert[dir] = new Date().toISOString();
  return drift;
}

async function main() {
  const prev = await readJson(path.join(DATA, 'bilan.json'));
  const recent = []; // { p, placed } dans l'ordre chronologique (France)
  const files = (await readdir(DATA)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const out = { updated: new Date().toISOString(), total: { fr: emptyAgg(), all: emptyAgg() }, days: [] };
  for (const f of files) {
    const day = await readJson(path.join(DATA, f));
    if (!day) continue;
    const d = { date: day.date, fr: emptyAgg(), all: emptyAgg(), details: [] };
    for (const reu of day.reunions || [])
      for (const c of reu.courses || []) {
        const r = scoreCourse(reu, c);
        if (!r) continue;
        add(d.all, r.agg);
        if (r.fr) {
          add(d.fr, r.agg);
          recent.push({ h: r.detail.heure || 0, p: r.detail.top.p, placed: r.detail.placed });
        }
        d.details.push(r.detail);
      }
    if (!d.all.courses) continue;
    add(out.total.all, d.all);
    add(out.total.fr, d.fr);
    d.details.sort((a, b) => (a.heure || 0) - (b.heure || 0));
    out.days.push(d);
  }
  recent.sort((a, b) => a.h - b.h);
  out.drift = await checkDrift(recent, prev);
  out.days.reverse(); // le plus récent d'abord
  out.days.forEach((d, k) => {
    if (k >= DETAIL_DAYS) delete d.details;
  });
  await writeFile(path.join(DATA, 'bilan.json'), JSON.stringify(out));
  const t = out.total.all;
  console.log(`Bilan : ${out.days.length} jour(s), ${t.courses} course(s) avec pronostic figé, n°1 placé ${t.topPlaced}/${t.courses}`);
}
main();
