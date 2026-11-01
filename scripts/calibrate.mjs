#!/usr/bin/env node
/*
 * Calibrage automatique du modèle Hoshi Turf à partir des arrivées archivées.
 *
 * Rejoue toutes les courses terminées de hippique/data/ dans l'ordre chronologique
 * (les statistiques jockeys/entraîneurs et le repos n'utilisent que les jours
 * précédents : aucune triche avec le résultat), puis ajuste les réglages du modèle
 * (poids des critères, dispersion, part du marché, correctif des places) pour que
 * les probabilités collent au mieux aux résultats observés.
 *
 * Validation honnête : réglages ajustés sur les 75 % de courses les plus anciennes,
 * performances mesurées sur les 25 % les plus récentes, puis ajustement final sur tout.
 *
 *   node scripts/calibrate.mjs          → au plus une fois toutes les 20 h
 *   node scripts/calibrate.mjs --force  → recalcule tout de suite
 *
 * Produit hippique/data/calibration.json, lu automatiquement par la page.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Turf = require(path.join(ROOT, 'hippique/engine.js'));
const DATA = path.join(ROOT, 'hippique/data');
const OUT = path.join(DATA, 'calibration.json');
const MIN_COURSES = 150; // en dessous, pas assez de recul pour calibrer
const FORCE = process.argv.includes('--force');

const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const readJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return d;
  }
};

// ------------------------------------------------------------------ jeu de données
async function buildDataset() {
  const today = parisToday();
  const days = (await readdir(DATA))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < today)
    .sort();
  const jockeys = {},
    entraineurs = {},
    lastSeen = {};
  const add = (map, k, pos) => {
    if (!k) return;
    const s = (map[k] ||= [0, 0, 0]);
    s[0]++;
    if (pos === 1) s[1]++;
    if (pos <= 3) s[2]++;
  };
  const items = [];
  for (const f of days) {
    const day = await readJson(path.join(DATA, f));
    if (!day) continue;
    const pending = [];
    for (const reu of day.reunions || [])
      for (const c of reu.courses || []) {
        if (!c.arrivee || !c.partants || c.partants.length < 2) continue;
        const rankOf = {};
        c.arrivee.forEach((g, k) => (Array.isArray(g) ? g : [g]).forEach((n) => (rankOf[n] = k + 1)));
        const runners = c.partants.map((p) => {
          const r = Object.assign({}, p);
          const j = Turf.statRate(jockeys[p.jockeyNom]);
          const e = Turf.statRate(entraineurs[p.entraineurNom]);
          r.jockey = j == null ? '' : j;
          r.entraineur = e == null ? '' : e;
          const last = lastSeen[p.nom];
          r.repos = last && last < day.date ? daysBetween(last, day.date) : '';
          r._pos = p.arrivee || rankOf[p.num] || 99;
          return r;
        });
        const prep = Turf.prepareRace({ discipline: c.discipline, runners });
        if (!prep) continue;
        const pos = prep.runners.map((r) => r._pos);
        const winner = pos.indexOf(1);
        if (winner < 0) continue;
        const nPlaces = Turf.placesPayees(prep.runners.length);
        items.push({ date: day.date, prep, winner, nPlaces, placed: pos.map((p) => p <= nPlaces) });
        pending.push(prep.runners);
      }
    // Les statistiques n'intègrent la journée qu'après l'avoir rejouée.
    for (const runners of pending)
      for (const r of runners) {
        add(jockeys, r.jockeyNom, r._pos);
        add(entraineurs, r.entraineurNom, r._pos);
        lastSeen[r.nom] = day.date;
      }
  }
  return { items, days: days.length };
}

// ------------------------------------------------------------------ mesures
const EPS = 1e-6;
function evaluate(items, settings, collect) {
  let win = 0,
    place = 0,
    nPlace = 0,
    brier = 0,
    topWin = 0,
    topPlace = 0,
    nTopPlace = 0;
  for (const it of items) {
    const wp = Turf.winProbs(it.prep, settings);
    const p = wp.pWin;
    win += -Math.log(Math.max(p[it.winner], EPS));
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    if (best === it.winner) topWin++;
    if (!it.nPlaces) continue;
    const pos = Turf.positionProbs(p, settings.placeDiscount);
    let bestP = 0,
      bestI = 0;
    for (let i = 0; i < p.length; i++) {
      let q = pos.pos1[i] + pos.pos2[i] + (it.nPlaces === 3 ? pos.pos3[i] : 0);
      q = Math.min(1 - EPS, Math.max(EPS, q));
      const y = it.placed[i] ? 1 : 0;
      place += -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
      brier += (q - y) * (q - y);
      nPlace++;
      if (q > bestP) (bestP = q), (bestI = i);
      if (collect) collect(q, y);
    }
    nTopPlace++;
    if (it.placed[bestI]) topPlace++;
  }
  const n = items.length || 1;
  return {
    courses: items.length,
    winLogLoss: win / n,
    placeLogLoss: place / (nPlace || 1),
    placeBrier: brier / (nPlace || 1),
    topWinRate: topWin / n,
    topPlaceRate: topPlace / (nTopPlace || 1),
    // Objectif optimisé : gagnant + placé (log-loss).
    objective: win / n + (3 * place) / (nPlace || 1),
  };
}

// ------------------------------------------------------------------ ajustement
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function params(s) {
  const list = [
    { get: () => s.temperature, set: (v) => (s.temperature = clamp(v, 3, 40)), step: 2 },
    { get: () => s.marketWeight, set: (v) => (s.marketWeight = clamp(v, 0, 1)), step: 0.1 },
    { get: () => s.placeDiscount, set: (v) => (s.placeDiscount = clamp(v, 0.4, 1.2)), step: 0.05 },
  ];
  for (const c of Turf.CRITERIA)
    list.push({ get: () => s.weights[c.key], set: (v) => (s.weights[c.key] = clamp(v, 0, 60)), step: 5 });
  return list;
}
function fit(items, start) {
  const s = JSON.parse(JSON.stringify(start));
  let best = evaluate(items, s).objective;
  const ps = params(s);
  for (let pass = 0; pass < 60; pass++) {
    let improved = false;
    for (const p of ps) {
      for (const dir of [1, -1]) {
        const old = p.get();
        p.set(old + dir * p.step);
        if (p.get() === old) continue;
        const v = evaluate(items, s).objective;
        if (v < best - 1e-7) {
          best = v;
          improved = true;
          break;
        }
        p.set(old);
      }
    }
    if (!improved) {
      let tiny = true;
      for (const p of ps) {
        p.step /= 2;
        if (p.step > 0.004) tiny = false;
      }
      if (tiny) break;
    }
  }
  // Arrondis lisibles.
  s.temperature = +s.temperature.toFixed(2);
  s.marketWeight = +s.marketWeight.toFixed(3);
  s.placeDiscount = +s.placeDiscount.toFixed(3);
  for (const k of Object.keys(s.weights)) s.weights[k] = +s.weights[k].toFixed(1);
  return s;
}

function reliability(items, settings) {
  const B = 10;
  const b = Array.from({ length: B }, () => ({ n: 0, pred: 0, obs: 0 }));
  evaluate(items, settings, (q, y) => {
    const k = Math.min(B - 1, Math.floor(q * B));
    b[k].n++;
    b[k].pred += q;
    b[k].obs += y;
  });
  return b.map((x, k) => ({
    from: k / B,
    to: (k + 1) / B,
    n: x.n,
    predicted: x.n ? +(x.pred / x.n).toFixed(4) : null,
    observed: x.n ? +(x.obs / x.n).toFixed(4) : null,
  }));
}
const round = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v]));

// ------------------------------------------------------------------ principal
async function main() {
  const prev = await readJson(OUT, null);
  if (!FORCE && prev && prev.updated && Date.now() - new Date(prev.updated) < 20 * 3600000) {
    console.log('Calibrage récent (' + prev.updated + '), rien à faire.');
    return;
  }
  const t0 = Date.now();
  const { items, days } = await buildDataset();
  console.log(`${items.length} courses terminées sur ${days} journées`);
  const defaults = Turf.mergeSettings({});
  const out = { updated: new Date().toISOString(), days, courses: items.length, minCourses: MIN_COURSES };

  if (items.length < MIN_COURSES) {
    out.status = 'insufficient';
    await writeFile(OUT, JSON.stringify(out, null, 1));
    console.log(`Pas assez de courses pour calibrer (${items.length}/${MIN_COURSES}).`);
    return;
  }

  // 1) Validation : ajustement sur le passé, mesure sur les courses récentes.
  const cut = Math.floor(items.length * 0.75);
  const train = items.slice(0, cut),
    test = items.slice(cut);
  const trainFit = fit(train, defaults);
  const market = Object.assign({}, defaults, { marketWeight: 1 });
  out.validation = {
    trainCourses: train.length,
    testCourses: test.length,
    testFrom: test[0].date,
    defaults: round(evaluate(test, defaults)),
    marketOnly: round(evaluate(test, market)),
    calibrated: round(evaluate(test, trainFit)),
  };
  out.reliability = reliability(test, trainFit);

  // 2) Réglages finaux : ajustement sur toutes les courses.
  const finalFit = fit(items, trainFit);
  out.status = 'ok';
  out.settings = {
    weights: finalFit.weights,
    temperature: finalFit.temperature,
    marketWeight: finalFit.marketWeight,
    placeDiscount: finalFit.placeDiscount,
  };
  out.seconds = Math.round((Date.now() - t0) / 1000);
  await writeFile(OUT, JSON.stringify(out, null, 1));
  const v = out.validation;
  console.log('Test (courses récentes) :');
  for (const k of ['defaults', 'marketOnly', 'calibrated'])
    console.log(
      `  ${k.padEnd(11)} log-loss gagnant ${v[k].winLogLoss}  placé ${v[k].placeLogLoss}  favori gagnant ${(v[k].topWinRate * 100).toFixed(1)} %  base placée ${(v[k].topPlaceRate * 100).toFixed(1)} %`,
    );
  console.log('Réglages :', JSON.stringify(out.settings));
}
main();
