#!/usr/bin/env node
/*
 * Calibrage, modèle appris et simulation de paris pour Hoshi Turf.
 *
 * 1. Rejoue toutes les courses terminées de hippique/data/ dans l'ordre chronologique.
 *    Les statistiques jockeys/entraîneurs n'utilisent que les jours précédents :
 *    aucune information postérieure à la course n'est utilisée.
 * 2. Pour chaque groupe (trot, galop) :
 *    - ajuste les réglages du modèle pondéré (poids, dispersion, part du marché, correctif places) ;
 *    - apprend un modèle « logit conditionnel » directement sur les résultats ;
 *    - garde celui qui prévoit le mieux les courses récentes qu'il n'a pas vues.
 * 3. Apprend la relation cote gagnant → rapport placé à partir des rapports définitifs.
 * 4. Simule plusieurs stratégies de paris sur les courses récentes avec les vrais rapports
 *    du PMU (mise fixe et mise de Kelly fractionnée) et indique si l'une est rentable
 *    de façon fiable.
 *
 * Validation honnête : tout est ajusté sur les 75 % de courses les plus anciennes et mesuré
 * sur les 25 % les plus récentes ; les réglages publiés sont ensuite réajustés sur tout.
 *
 *   node scripts/calibrate.mjs          → au plus une fois toutes les 20 h
 *   node scripts/calibrate.mjs --force  → recalcule tout de suite
 */
import { createRequire } from 'node:module';
import { readFile, writeFile as writeFileRaw, readdir, rename } from 'node:fs/promises';
import { archiveDates, readArchiveDay } from './archive.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Turf = require(path.join(ROOT, 'hippique/engine.js'));
const DATA = path.join(ROOT, 'hippique/data');
const OUT = path.join(DATA, 'calibration.json');
const MIN_COURSES = 150; // en dessous, pas assez de recul pour calibrer
const MIN_GROUP = 250; // courses minimum pour des réglages propres à un groupe
const MIN_LEARNED = 600; // courses d'entraînement minimum pour le modèle appris
const FORCE = process.argv.includes('--force');
// Historique (archive) : Elo sur tout l'historique, jockeys/entraîneurs sur STATS_DAYS,
// modèles ajustés sur les FIT_DAYS derniers jours (au plus MAX_FIT courses, les plus récentes).
const STATS_DAYS = Number(process.env.STATS_DAYS) || 1095;
const FIT_DAYS = Number(process.env.FIT_DAYS) || 540;
const MAX_FIT = Number(process.env.MAX_FIT) || 25000;
// Modèle « Outsiders » : logit conditionnel sur les OUT_DAYS derniers jours (cotes du matin).
const OUT_DAYS = Number(process.env.OUT_DAYS) || 730;
const OUT_MAX = 40000;
// Écriture atomique : la boucle peut publier pendant que le calibrage tourne en arrière-plan.
const writeFile = async (f, data) => {
  await writeFileRaw(f + '.tmp', data);
  await rename(f + '.tmp', f);
};
const isoMinus = (iso, d) => new Date(Date.parse(iso + 'T12:00:00Z') - d * 86400000).toISOString().slice(0, 10);

const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(n) ? n : null;
};
const readJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return d;
  }
};
const round = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v]));

// ------------------------------------------------------------------ jeu de données
async function buildDataset() {
  const today = parisToday();
  const siteDays = (await readdir(DATA)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < today).map((f) => f.slice(0, 10));
  const inSite = new Set(siteDays);
  const archived = (await archiveDates()).filter((d) => d < today && !inSite.has(d));
  const days = [...archived.map((d) => ({ d, arch: true })), ...siteDays.map((d) => ({ d, arch: false }))].sort((a, b) => (a.d < b.d ? -1 : 1));
  const statsFrom = isoMinus(today, STATS_DAYS),
    fitFrom = isoMinus(today, FIT_DAYS),
    outFrom = isoMinus(today, OUT_DAYS);
  const outsider = []; // jeu de données compact du modèle Outsiders
  const statDates = [];
  const jockeys = {},
    entraineurs = {},
    lastSeen = {},
    ratings = {}; // Elo : nom → [note, nombre de courses]
  const oddsSource = { T: 0, ref: 0, final: 0 };
  const add = (map, k, pos) => {
    if (!k) return;
    const s = (map[k] ||= [0, 0, 0]);
    s[0]++;
    if (pos === 1) s[1]++;
    if (pos <= 3) s[2]++;
  };
  const items = [];
  for (const { d, arch } of days) {
    const day = arch ? await readArchiveDay(d) : await readJson(path.join(DATA, d + '.json'));
    if (!day) continue;
    const fit = day.date >= fitFrom,
      withStats = day.date >= statsFrom;
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
          if (r.repos == null) {
            const last = lastSeen[p.nom];
            r.repos = last && last < day.date ? daysBetween(last, day.date) : '';
          }
          // Cote de décision : la cote de référence du matin (c'est sur elle que se décide le
          // Choix Hoshi : face aux cotes de dernière minute, l'avantage du modèle disparaît),
          // sinon la cote ≈ 20 min avant le départ, sinon la cote finale.
          r.coteFinal = p.cote;
          if (p.coteRef) (r.cote = p.coteRef), oddsSource.ref++;
          else if (p.coteT) (r.cote = p.coteT), oddsSource.T++;
          else if (p.cote) oddsSource.final++;
          const el = ratings[p.nom];
          if (el) (r.rating = el[0]), (r.ratingN = el[1]);
          r._pos = p.arrivee || rankOf[p.num] || 99;
          return r;
        });
        const wantOut = day.date >= outFrom && c.rapports;
        if (!fit && !wantOut) {
          // Avant les fenêtres d'ajustement : seulement pour les notes et statistiques.
          pending.push(runners);
          continue;
        }
        const prep = Turf.prepareRace({ discipline: c.discipline, allocation: c.allocation, runners });
        if (!prep) {
          pending.push(runners);
          continue;
        }
        if (wantOut && prep.market) {
          const R = prep.runners,
            w = R.findIndex((r) => r._pos === 1);
          if (w >= 0) {
            const F = Turf.featureVector(prep, 0).length;
            const X = new Float32Array(R.length * F);
            R.forEach((_, i) => X.set(Turf.featureVector(prep, i), i * F));
            outsider.push({
              date: day.date,
              fr: !reu.pays || reu.pays === 'FRA',
              disc: c.discipline,
              n: R.length,
              np: Turf.placesPayees(R.length),
              F,
              X,
              w,
              pm: Float32Array.from(prep.market.probs),
              cm: R.map((r) => num(r.cote)),
              pg: R.map((r) => (c.rapports.g ? c.rapports.g[String(r.num)] || 0 : 0)),
              pp: R.map((r) => (c.rapports.p ? c.rapports.p[String(r.num)] || 0 : 0)),
              hasP: !!(c.rapports.p && Object.keys(c.rapports.p).length),
            });
          }
        }
        if (!fit) {
          pending.push(prep.runners);
          continue;
        }
        const pos = prep.runners.map((r) => r._pos);
        const winner = pos.indexOf(1);
        if (winner < 0) continue;
        const nPlaces = Turf.placesPayees(prep.runners.length);
        items.push({
          date: day.date,
          heure: c.heure || 0,
          group: Turf.disciplineGroup(c.discipline),
          groupKeys: Turf.raceGroupKeys({ discipline: c.discipline, categorie: c.categorie }).slice(0, 2),
          prep,
          winner,
          nPlaces,
          placed: pos.map((p) => p <= nPlaces),
          rapports: c.rapports || null,
        });
        pending.push(prep.runners);
      }
    // Les statistiques n'intègrent la journée qu'après l'avoir rejouée.
    for (const runners of pending) {
      eloUpdate(
        ratings,
        runners.filter((r) => !r.nonPartant),
      );
      for (const r of runners) {
        if (r.nonPartant) continue;
        if (withStats) {
          add(jockeys, r.jockeyNom, r._pos);
          add(entraineurs, r.entraineurNom, r._pos);
        }
        lastSeen[r.nom] = day.date;
      }
    }
    if (withStats && pending.length) statDates.push(day.date);
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.heure - b.heure));
  const all = items.length;
  if (items.length > MAX_FIT) items.splice(0, items.length - MAX_FIT);
  return { items, all, days: days.length, archived: archived.length, ratings, oddsSource, outsider, stats: { jockeys, entraineurs, lastSeen, dates: statDates } };
}

/**
 * Elo multi-chevaux : chaque course est une série de duels (le mieux classé gagne le duel).
 * K = 24, réparti sur les duels ; les non-classés sont derrière tous les classés.
 */
function eloUpdate(ratings, runners) {
  const rs = runners.filter((r) => r.nom);
  const n = rs.length;
  if (n < 2) return;
  const R = rs.map((r) => (ratings[r.nom] ? ratings[r.nom][0] : 1500));
  const d = new Array(n).fill(0);
  const K = 24 / (n - 1);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const pi = rs[i]._pos,
        pj = rs[j]._pos;
      if (pi === pj) continue;
      const S = pi < pj ? 1 : 0;
      const E = 1 / (1 + Math.pow(10, (R[j] - R[i]) / 400));
      d[i] += K * (S - E);
      d[j] -= K * (S - E);
    }
  rs.forEach((r, i) => {
    const o = ratings[r.nom] || [1500, 0];
    ratings[r.nom] = [R[i] + d[i], o[1] + 1];
  });
}

// ------------------------------------------------------------------ modèle Outsiders
/** Logit conditionnel sur jeu compact (même méthode que l'étude sur 142 000 courses). */
function fitCL(list, iters = 150, l2 = 0.002) {
  const F = list[0].F;
  const mean = new Float64Array(F),
    sd = new Float64Array(F);
  let cnt = 0;
  for (const r of list)
    for (let i = 0; i < r.n; i++) {
      cnt++;
      for (let k = 0; k < F; k++) mean[k] += r.X[i * F + k];
    }
  for (let k = 0; k < F; k++) mean[k] /= cnt;
  for (const r of list) for (let i = 0; i < r.n; i++) for (let k = 0; k < F; k++) sd[k] += (r.X[i * F + k] - mean[k]) ** 2;
  for (let k = 0; k < F; k++) sd[k] = Math.sqrt(sd[k] / cnt) || 1;
  const beta = new Float64Array(F),
    m = new Float64Array(F),
    v = new Float64Array(F);
  const u = new Float64Array(64),
    z = new Float64Array(64 * F);
  for (let t = 1; t <= iters; t++) {
    const g = new Float64Array(F);
    for (let k = 0; k < F; k++) g[k] = l2 * beta[k];
    for (const r of list) {
      let mx = -1e9;
      for (let i = 0; i < r.n; i++) {
        let a = 0;
        for (let k = 0; k < F; k++) {
          const zz = (r.X[i * F + k] - mean[k]) / sd[k];
          z[i * F + k] = zz;
          a += zz * beta[k];
        }
        u[i] = a;
        if (a > mx) mx = a;
      }
      let tot = 0;
      for (let i = 0; i < r.n; i++) (u[i] = Math.exp(u[i] - mx)), (tot += u[i]);
      for (let i = 0; i < r.n; i++) {
        const coef = (u[i] / tot - (i === r.w ? 1 : 0)) / list.length;
        for (let k = 0; k < F; k++) g[k] += coef * z[i * F + k];
      }
    }
    for (let k = 0; k < F; k++) {
      m[k] = 0.9 * m[k] + 0.1 * g[k];
      v[k] = 0.999 * v[k] + 0.001 * g[k] * g[k];
      beta[k] -= (0.05 * (m[k] / (1 - 0.9 ** t))) / (Math.sqrt(v[k] / (1 - 0.999 ** t)) + 1e-8);
    }
  }
  const r5 = (a) => Array.from(a, (x) => +x.toFixed(5));
  return { beta: r5(beta), mean: r5(mean), sd: r5(sd) };
}
function clProbs(L, r) {
  const F = r.F,
    u = [];
  let mx = -1e9;
  for (let i = 0; i < r.n; i++) {
    let a = 0;
    for (let k = 0; k < F; k++) a += L.beta[k] * ((r.X[i * F + k] - L.mean[k]) / L.sd[k]);
    u.push(a);
    if (a > mx) mx = a;
  }
  const e = u.map((x) => Math.exp(x - mx)),
    t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}
const thin = (list, max) => (list.length > max ? list.filter((_, i) => i % Math.ceil(list.length / max) === 0) : list);
/** Contrôle : réglé sur la 1re moitié de la fenêtre, mesuré sur la 2de (≈ un an de courses, France). */
function outsiderModel(list) {
  if (list.length < 3000) return null;
  const cut = Math.floor(list.length * 0.5);
  const Lt = fitCL(thin(list.slice(0, cut), OUT_MAX));
  const pays = [];
  let wins = 0;
  for (const r of list.slice(cut)) {
    if (!r.fr || !Turf.outsiderDiscipline(r.disc)) continue;
    const p = clProbs(Lt, r);
    for (let i = 0; i < r.n; i++) {
      if (!(r.cm[i] > 1) || !(r.pm[i] > 0) || p[i] / r.pm[i] < Turf.OUTSIDER_RATIO) continue;
      pays.push(r.pg[i] + (r.hasP ? r.pp[i] : 1)); // 1 € gagnant + 1 € placé (placé inconnu : remboursé)
      if (r.pg[i] > 0) wins++;
    }
  }
  const n = pays.length,
    mean = n ? pays.reduce((a, b) => a + b, 0) / n : 0;
  const sdv = n > 1 ? Math.sqrt(pays.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const test = {
    from: list[cut].date,
    bets: n,
    wins,
    staked: 2 * n,
    returned: +pays.reduce((a, b) => a + b, 0).toFixed(1),
    roi: n ? +(mean / 2 - 1).toFixed(4) : 0,
    roiSE: n ? +(sdv / 2 / Math.sqrt(n)).toFixed(4) : null,
  };
  test.validated = n >= 100 && test.roi - 2 * test.roiSE > 0;
  // Modèle publié : réajusté sur toute la fenêtre.
  const L = fitCL(thin(list, OUT_MAX));
  return Object.assign(L, { threshold: Turf.OUTSIDER_RATIO, disciplines: Turf.OUTSIDER_DISCIPLINES, placeDiscount: 0.7, courses: list.length, from: list[0].date, test });
}

// ------------------------------------------------------------------ mesures
const EPS = 1e-6;
function predict(it, settings) {
  const p = Turf.winProbs(it.prep, settings).pWin;
  const pos = Turf.positionProbs(p, settings.placeDiscount);
  const place = p.map((_, i) =>
    it.nPlaces ? pos.pos1[i] + pos.pos2[i] + (it.nPlaces === 3 ? pos.pos3[i] : 0) : null,
  );
  return { p, place };
}
function evaluate(items, settings, collect) {
  let win = 0,
    place = 0,
    nPlace = 0,
    brier = 0,
    topWin = 0,
    topPlace = 0,
    nTopPlace = 0;
  for (const it of items) {
    const { p, place: pl } = predict(it, settings);
    win += -Math.log(Math.max(p[it.winner], EPS));
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    if (best === it.winner) topWin++;
    if (!it.nPlaces) continue;
    let bestP = 0,
      bestI = 0;
    for (let i = 0; i < p.length; i++) {
      const q = Math.min(1 - EPS, Math.max(EPS, pl[i]));
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
    objective: win / n + (3 * place) / (nPlace || 1),
  };
}

// ------------------------------------------------------------------ modèle pondéré
function params(s) {
  const list = [
    { get: () => s.temperature, set: (v) => (s.temperature = clamp(v, 2, 40)), step: 2 },
    { get: () => s.marketWeight, set: (v) => (s.marketWeight = clamp(v, 0, 1)), step: 0.1 },
    { get: () => s.marketPower || 1, set: (v) => (s.marketPower = clamp(v, 0.7, 1.8)), step: 0.1 },
    { get: () => s.placeDiscount, set: (v) => (s.placeDiscount = clamp(v, 0.4, 1.2)), step: 0.05 },
  ];
  for (const c of Turf.CRITERIA)
    list.push({ get: () => s.weights[c.key], set: (v) => (s.weights[c.key] = clamp(v, 0, 60)), step: 5 });
  return list;
}
function fitWeighted(items, start) {
  const s = JSON.parse(JSON.stringify(start));
  delete s.learned;
  let best = evaluate(items, s).objective;
  const ps = params(s);
  for (let pass = 0; pass < 25; pass++) {
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
        if (p.step > 0.01) tiny = false;
      }
      if (tiny) break;
    }
  }
  s.temperature = +s.temperature.toFixed(2);
  s.marketWeight = +s.marketWeight.toFixed(3);
  s.marketPower = +(s.marketPower || 1).toFixed(3);
  s.placeDiscount = +s.placeDiscount.toFixed(3);
  for (const k of Object.keys(s.weights)) s.weights[k] = +s.weights[k].toFixed(1);
  return s;
}

// ------------------------------------------------------------------ modèle appris
/**
 * Logit conditionnel : P(i gagne) = exp(β·x_i) / Σ_j exp(β·x_j), avec x = sous-notes
 * standardisées, indicateurs « inconnu » et probabilité du marché. Ajusté par descente
 * de gradient (Adam) avec pénalité L2, puis correctif des places réglé séparément.
 */
function fitLearned(items, base) {
  const X = items.map((it) => it.prep.runners.map((_, i) => Turf.featureVector(it.prep, i)));
  const F = X[0][0].length;
  const mean = new Array(F).fill(0),
    sd = new Array(F).fill(0);
  let cnt = 0;
  for (const xs of X) for (const x of xs) (cnt++, x.forEach((v, k) => (mean[k] += v)));
  mean.forEach((_, k) => (mean[k] /= cnt));
  for (const xs of X) for (const x of xs) x.forEach((v, k) => (sd[k] += (v - mean[k]) ** 2));
  sd.forEach((_, k) => (sd[k] = Math.sqrt(sd[k] / cnt) || 1));
  const Z = X.map((xs) => xs.map((x) => x.map((v, k) => (v - mean[k]) / sd[k])));
  const beta = new Array(F).fill(0);
  const m = new Array(F).fill(0),
    v2 = new Array(F).fill(0);
  const lr = 0.05,
    l2 = 0.002;
  for (let t = 1; t <= 400; t++) {
    const g = beta.map((b) => l2 * b);
    for (let n = 0; n < Z.length; n++) {
      const zs = Z[n];
      const u = zs.map((z) => z.reduce((a, zk, k) => a + zk * beta[k], 0));
      const mx = Math.max(...u);
      const e = u.map((x) => Math.exp(x - mx));
      const tot = e.reduce((a, b) => a + b, 0);
      const w = items[n].winner;
      for (let i = 0; i < zs.length; i++) {
        const coef = e[i] / tot - (i === w ? 1 : 0);
        for (let k = 0; k < F; k++) g[k] += (coef * zs[i][k]) / Z.length;
      }
    }
    for (let k = 0; k < F; k++) {
      m[k] = 0.9 * m[k] + 0.1 * g[k];
      v2[k] = 0.999 * v2[k] + 0.001 * g[k] * g[k];
      const mh = m[k] / (1 - 0.9 ** t),
        vh = v2[k] / (1 - 0.999 ** t);
      beta[k] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
    }
  }
  const learned = {
    beta: beta.map((b) => +b.toFixed(5)),
    mean: mean.map((x) => +x.toFixed(5)),
    sd: sd.map((x) => +x.toFixed(5)),
  };
  const s = Object.assign(JSON.parse(JSON.stringify(base)), { learned });
  // Correctif des places : recherche simple.
  let best = Infinity,
    bestL = s.placeDiscount;
  for (let l = 0.5; l <= 1.15; l += 0.05) {
    s.placeDiscount = l;
    const o = evaluate(items, s).objective;
    if (o < best) (best = o), (bestL = l);
  }
  s.placeDiscount = +bestL.toFixed(2);
  return s;
}

/** Référence « cotes du marché seules », avec seulement le correctif des places ajusté. */
function fitMarket(items, base) {
  const s = Object.assign(JSON.parse(JSON.stringify(base)), { marketWeight: 1 });
  delete s.learned;
  // 1) correctif favori-outsider (k) sur le gagnant, 2) correctif des places.
  let best = Infinity,
    bestK = 1;
  for (let k = 0.8; k <= 1.61; k += 0.05) {
    s.marketPower = k;
    const o = evaluate(items, s).winLogLoss;
    if (o < best) (best = o), (bestK = k);
  }
  s.marketPower = +bestK.toFixed(2);
  best = Infinity;
  let bestL = s.placeDiscount;
  for (let l = 0.5; l <= 1.15; l += 0.05) {
    s.placeDiscount = l;
    const o = evaluate(items, s).objective;
    if (o < best) (best = o), (bestL = l);
  }
  s.placeDiscount = +bestL.toFixed(2);
  return s;
}

// ------------------------------------------------------------------ rapports placés
/** Relation cote gagnant → rapport placé : log(rapport - 1) = a + b·log(cote - 1). */
function fitPlaceOdds(items) {
  const out = {};
  for (const np of [2, 3]) {
    const xs = [],
      ys = [];
    for (const it of items) {
      if (it.nPlaces !== np || !it.rapports || !it.rapports.p) continue;
      it.prep.runners.forEach((r) => {
        const c = num(r.cote),
          rp = it.rapports.p[String(r.num)];
        if (c > 1 && rp > 1) xs.push(Math.log(c - 1)), ys.push(Math.log(rp - 1));
      });
    }
    if (xs.length < 40) continue;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length,
      my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0,
      sxx = 0;
    xs.forEach((x, i) => ((sxy += (x - mx) * (ys[i] - my)), (sxx += (x - mx) ** 2)));
    const b = sxx ? sxy / sxx : 0.72;
    const a = my - b * mx;
    // Correction de Duan : la régression en logarithmes donne le rapport « typique » (médian),
    // qui sous-estime le rapport moyen. On multiplie par la moyenne des exp(résidus).
    const smear = xs.reduce((acc, x, i) => acc + Math.exp(ys[i] - (a + b * x)), 0) / xs.length;
    // Table « cote → rapport placé moyen observé » par tranches de cote (interpolée ensuite) :
    // plus fidèle que la seule formule sur toute la gamme, des favoris aux gros outsiders.
    const pts = xs.map((x, i) => [x, Math.exp(ys[i]) + 1]).sort((p, q) => p[0] - q[0]);
    const nb = Math.max(4, Math.min(14, Math.floor(pts.length / 120)));
    const table = [];
    for (let k = 0; k < nb; k++) {
      const part = pts.slice(Math.floor((k * pts.length) / nb), Math.floor(((k + 1) * pts.length) / nb));
      if (!part.length) continue;
      const lx = part.reduce((acc, p) => acc + p[0], 0) / part.length;
      const rp = part.reduce((acc, p) => acc + p[1], 0) / part.length;
      table.push([+(Math.exp(lx) + 1).toFixed(2), +rp.toFixed(3)]);
    }
    out[np] = { a: +a.toFixed(4), b: +b.toFixed(4), smear: +smear.toFixed(4), table, n: xs.length };
  }
  return out;
}

// ------------------------------------------------------------------ simulation de paris
const STRATEGIES = [
  { id: 'fav_marche_g', label: 'Gagnant sur le favori du marché', type: 'g' },
  { id: 'fav_modele_g', label: 'Gagnant sur le favori du modèle', type: 'g' },
  { id: 'base_p', label: 'Placé sur la base du modèle', type: 'p' },
  ...[1.05, 1.15, 1.3].map((t) => ({ id: 'val_g_' + t, label: `Gagnant « valeur » ≥ ${t}`, type: 'g', t })),
  ...[1.05, 1.15, 1.3].map((t) => ({ id: 'val_p_' + t, label: `Placé « valeur » ≥ ${t}`, type: 'p', t })),
  { id: 'choix_g', label: 'Choix Hoshi en gagnant', type: 'g', choice: true },
  { id: 'choix_p', label: 'Choix Hoshi en placé', type: 'p', choice: true },
];
function selections(st, it, pr, coefs) {
  const R = it.prep.runners;
  const cotes = R.map((r) => num(r.cote));
  const idx = R.map((_, i) => i);
  const argmax = (f) => idx.reduce((b, i) => (f(i) > f(b) ? i : b), 0);
  if (st.choice) {
    const m = it.prep.market;
    if (!m || (st.type === 'p' && !it.nPlaces)) return [];
    const pm = m.probs.map((q, i) => (cotes[i] > 1 ? q : null));
    const k = Turf.choiceIndex(pr.p, it.nPlaces ? pr.place : null, pm, st.type);
    return k < 0 ? [] : [k];
  }
  switch (true) {
    case st.id === 'fav_marche_g':
      return cotes.some((c) => c) ? [argmax((i) => (cotes[i] ? -cotes[i] : -1e9))] : [];
    case st.id === 'fav_modele_g':
      return [argmax((i) => pr.p[i])];
    case st.id === 'base_p':
      return it.nPlaces ? [argmax((i) => pr.place[i])] : [];
    case st.type === 'g':
      return idx.filter((i) => cotes[i] > 1 && pr.p[i] >= 0.03 && pr.p[i] * cotes[i] >= st.t);
    case st.type === 'p':
      if (!it.nPlaces) return [];
      return idx.filter((i) => {
        const o = Turf.estimatePlaceOdds(cotes[i], it.nPlaces, coefs);
        return o && pr.place[i] * o >= st.t;
      });
  }
  return [];
}
function backtest(items, settingsOf, coefs) {
  const withR = items.filter((it) => it.rapports);
  const res = [];
  for (const st of STRATEGIES) {
    const profits = [];
    let stake = 0,
      ret = 0,
      hits = 0,
      bank = 100,
      peakBank = 100,
      maxDdBank = 0;
    const curve = [];
    for (const it of withR) {
      const pr = predict(it, settingsOf(it));
      for (const i of selections(st, it, pr, coefs)) {
        const r = it.prep.runners[i];
        const pay = (st.type === 'g' ? it.rapports.g : it.rapports.p)[String(r.num)] || 0;
        stake += 1;
        ret += pay;
        if (pay > 0) hits++;
        profits.push(pay - 1);
        curve.push(+(ret - stake).toFixed(2));
        // Kelly fractionné (¼, plafonné à 2 % de la bankroll) avec la cote estimée avant course.
        const c = num(r.cote);
        const o = st.type === 'g' ? c : Turf.estimatePlaceOdds(c, it.nPlaces, coefs);
        const p = st.type === 'g' ? pr.p[i] : pr.place[i];
        const f = Math.min(0.02, 0.25 * Turf.kelly(p, o));
        if (f > 0) {
          const s = bank * f;
          bank += s * (pay - 1);
          peakBank = Math.max(peakBank, bank);
          maxDdBank = Math.max(maxDdBank, 1 - bank / peakBank);
        }
      }
    }
    const n = profits.length;
    const roi = n ? (ret - stake) / stake : 0;
    const sdv = n > 1 ? Math.sqrt(profits.reduce((a, x) => a + (x - roi) ** 2, 0) / (n - 1)) : 0;
    let peak = 0,
      dd = 0;
    curve.forEach((v) => ((peak = Math.max(peak, v)), (dd = Math.max(dd, peak - v))));
    const step = Math.max(1, Math.ceil(curve.length / 120));
    res.push({
      id: st.id,
      label: st.label,
      type: st.type,
      threshold: st.t || null,
      bets: n,
      hitRate: n ? +(hits / n).toFixed(4) : 0,
      staked: stake,
      returned: +ret.toFixed(2),
      roi: +roi.toFixed(4),
      roiSE: n ? +(sdv / Math.sqrt(n)).toFixed(4) : null,
      maxDrawdown: +dd.toFixed(2),
      kellyBankroll: +bank.toFixed(2),
      kellyMaxDrawdown: +maxDdBank.toFixed(4),
      curve: curve.filter((_, k) => k % step === 0 || k === curve.length - 1),
    });
  }
  // Significatif : ROI positif même en retirant deux erreurs-types (marge de hasard).
  res.forEach((r) => (r.significant = r.bets >= 50 && r.roi - 2 * r.roiSE > 0));
  const candidates = res.filter((r) => (r.id.startsWith('val_') || r.id.startsWith('choix_')) && r.bets >= 30 && r.roi > 0).sort((a, b) => b.roi - a.roi);
  return { courses: withR.length, from: withR[0] ? withR[0].date : null, strategies: res, best: candidates[0] ? candidates[0].id : null };
}

function reliability(items, settingsOf) {
  const B = 10;
  const b = Array.from({ length: B }, () => ({ n: 0, pred: 0, obs: 0 }));
  for (const it of items)
    evaluate([it], settingsOf(it), (q, y) => {
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

// ------------------------------------------------------------------ principal
function fitGroup(train, start, log, wantLearned = true) {
  const weighted = fitWeighted(train, start);
  let learned = null;
  if (wantLearned && train.length >= MIN_LEARNED) {
    learned = fitLearned(train, weighted);
    log && log(`    modèle appris : ${learned.learned.beta.length} coefficients`);
  }
  return { weighted, learned };
}
const publicSettings = (s) => ({
  weights: s.weights,
  temperature: s.temperature,
  marketWeight: s.marketWeight,
  marketPower: s.marketPower || 1,
  placeDiscount: s.placeDiscount,
});

/** Mesure combinée : chaque course avec les réglages de son groupe. */
function evaluateBy(items, settingsOf) {
  const acc = {};
  let n = 0;
  const buckets = new Map();
  for (const it of items) {
    const st = settingsOf(it);
    if (!buckets.has(st)) buckets.set(st, []);
    buckets.get(st).push(it);
  }
  for (const [st, list] of buckets) {
    const m = evaluate(list, st);
    for (const k of Object.keys(m)) acc[k] = (acc[k] || 0) + m[k] * list.length;
    n += list.length;
  }
  for (const k of Object.keys(acc)) acc[k] /= n || 1;
  acc.courses = n;
  return acc;
}

/**
 * Ajuste les modèles candidats pour chaque groupe assez fourni et garde, pour chaque groupe,
 * celui qui prévoit le mieux le jeu de contrôle. Renvoie { key → { model, settings } }.
 */
function chooseModels(train, control, defaults, globalS, log) {
  const keys = new Map();
  for (const it of train) for (const k of it.groupKeys) keys.set(k, (keys.get(k) || 0) + 1);
  const groups = {};
  const seen = new Map(); // ensemble de courses identique → même groupe (inutile de réajuster)
  for (const [key, count] of [...keys].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)) {
    if (count < MIN_GROUP) continue;
    const tr = train.filter((it) => it.groupKeys.includes(key));
    const sig = count + ':' + tr[0].date + tr[0].heure + ':' + tr[tr.length - 1].date + tr[tr.length - 1].heure;
    if (seen.has(sig)) {
      groups[key] = Object.assign({ sameAs: seen.get(sig) }, groups[seen.get(sig)]);
      continue;
    }
    seen.set(sig, key);
    const ct = control.filter((it) => it.groupKeys.includes(key));
    log && log(`  groupe ${key} : ${tr.length} courses d'entraînement, ${ct.length} de contrôle`);
    const cand = { global: globalS, market: fitMarket(tr, defaults) };
    const f = fitGroup(tr, globalS, log);
    cand.weighted = f.weighted;
    if (f.learned) cand.learned = f.learned;
    const test = {};
    let best = 'global';
    if (ct.length) {
      for (const [k, st] of Object.entries(cand)) test[k] = round(evaluate(ct, st));
      for (const k of Object.keys(cand)) if (test[k].objective < test[best].objective) best = k;
    }
    groups[key] = { model: best, settings: cand[best], trainCourses: tr.length, testCourses: ct.length, test };
  }
  return groups;
}
const resolver = (groups, globalS) => (it) => {
  for (const k of it.groupKeys) if (groups[k]) return groups[k].settings;
  return globalS;
};

async function main() {
  const prev = await readJson(OUT, null);
  if (!FORCE && prev && prev.status === 'ok' && prev.version === 5 && Date.now() - new Date(prev.updated) < 20 * 3600000) {
    console.log('Calibrage récent (' + prev.updated + '), rien à faire.');
    return;
  }
  const t0 = Date.now();
  const { items, all, days, archived, ratings, oddsSource, stats, outsider } = await buildDataset();
  console.log(`${all} courses terminées dans la fenêtre d'ajustement (${items.length} utilisées) · ${days} journées lues dont ${archived} archivées`);
  console.log(`cotes utilisées : ${oddsSource.T} au moment du pari, ${oddsSource.ref} du matin, ${oddsSource.final} finales`);
  const defaults = Turf.mergeSettings({});
  const out = { updated: new Date().toISOString(), days, courses: items.length, minCourses: MIN_COURSES, version: 5, oddsSource };

  // Notes Elo à jour pour la page et les alertes.
  const rt = {};
  for (const [k, v] of Object.entries(ratings)) rt[k] = [Math.round(v[0]), v[1]];
  await writeFile(path.join(DATA, 'ratings.json'), JSON.stringify({ updated: out.updated, ratings: rt }));
  // Statistiques jockeys / entraîneurs pour la page et les alertes : mêmes chiffres que ceux du
  // calibrage (fenêtre de STATS_DAYS jours, archive comprise). La mise à jour courante y ajoute
  // ensuite chaque journée terminée.
  const yearAgo = isoMinus(parisToday(), 365);
  const chevaux = {};
  for (const [k, v] of Object.entries(stats.lastSeen)) if (v >= yearAgo) chevaux[k] = v;
  await writeFile(
    path.join(DATA, 'stats.json'),
    JSON.stringify({ dates: stats.dates.filter((d) => d >= yearAgo), jockeys: stats.jockeys, entraineurs: stats.entraineurs, chevaux, updated: out.updated }),
  );

  // Modèle Outsiders : retiré (avantage dû à un défaut des données, voir engine.js). Plus calculé.
  const tO = Date.now();
  out.outsider = Turf.OUTSIDER_ENABLED ? outsiderModel(outsider) : null;
  outsider.length = 0;
  if (out.outsider) {
    const t = out.outsider.test;
    console.log(
      `Outsiders : modèle sur ${out.outsider.courses} courses depuis le ${out.outsider.from} (${Math.round((Date.now() - tO) / 1000)} s) · ` +
        `contrôle depuis le ${t.from} : ${t.bets} paris, ${t.wins} gagnés, ${t.returned} € pour ${t.staked} € (${(t.roi * 100).toFixed(1)} % ± ${(t.roiSE * 200).toFixed(1)})${t.validated ? ' ✔ VALIDÉ' : ''}`,
    );
  }
  if (items.length < MIN_COURSES) {
    out.status = 'insufficient';
    await writeFile(OUT, JSON.stringify(out, null, 1));
    console.log(`Pas assez de courses pour calibrer (${items.length}/${MIN_COURSES}).`);
    return;
  }

  // Trois périodes chronologiques, jamais mélangées :
  //  - entraînement (60 %) : ajustement des modèles ;
  //  - sélection (20 %)    : choix du modèle de chaque groupe et de la meilleure stratégie ;
  //  - confirmation (20 %) : vérification finale, sur des courses qui n'ont servi à aucun choix.
  const c1 = Math.floor(items.length * 0.6),
    c2 = Math.floor(items.length * 0.8);
  const train = items.slice(0, c1),
    sel = items.slice(c1, c2),
    conf = items.slice(c2);
  const globalTrain = fitWeighted(train, defaults);
  const groupsTrain = chooseModels(train, sel, defaults, globalTrain, console.log);
  const settingsOf = resolver(groupsTrain, globalTrain);
  const marketS = Object.assign({}, defaults, { marketWeight: 1 });
  const placeOdds = fitPlaceOdds(train);

  out.validation = {
    trainCourses: train.length,
    selectionCourses: sel.length,
    testCourses: conf.length,
    testFrom: conf[0].date,
    defaults: round(evaluate(conf, defaults)),
    marketOnly: round(evaluate(conf, marketS)),
    calibrated: round(evaluateBy(conf, settingsOf)),
  };
  out.reliability = reliability(conf, settingsOf);

  // Stratégies : choisie sur la période de sélection, confirmée (ou non) sur la dernière.
  const btSel = backtest(sel, settingsOf, placeOdds);
  const btConf = backtest(conf, settingsOf, placeOdds);
  const chosen = btSel.best;
  const strategies = btConf.strategies.map((st) => {
    const s1 = btSel.strategies.find((x) => x.id === st.id);
    return Object.assign({}, st, {
      roiSelection: s1 ? s1.roi : null,
      betsSelection: s1 ? s1.bets : 0,
      chosen: st.id === chosen,
      validated: st.id === chosen && st.significant,
    });
  });
  out.backtest = {
    courses: btConf.courses,
    from: btConf.from,
    selectionCourses: btSel.courses,
    selectionFrom: btSel.from,
    best: chosen,
    validated: strategies.some((x) => x.validated),
    strategies,
  };
  console.log(`Simulation de paris (sélection depuis ${btSel.from}, confirmation depuis ${btConf.from}) :`);
  for (const st of strategies)
    console.log(
      `  ${st.label.padEnd(36)} sélection ${String(st.betsSelection).padStart(4)} paris ${((st.roiSelection || 0) * 100).toFixed(1).padStart(6)} %` +
        ` | confirmation ${String(st.bets).padStart(4)} paris ${(st.roi * 100).toFixed(1).padStart(6)} % ± ${((st.roiSE || 0) * 200).toFixed(1)}` +
        `${st.chosen ? '  ← choisie' : ''}${st.validated ? ' ✔ VALIDÉE' : ''}`,
    );

  // Réglages publiés : réajustés sur toutes les courses, avec le type de modèle retenu par groupe.
  out.placeOdds = fitPlaceOdds(items);
  const globalAll = fitWeighted(items, globalTrain);
  out.settings = publicSettings(globalAll);
  out.groups = {};
  for (const [key, g] of Object.entries(groupsTrain)) {
    if (g.sameAs && out.groups[g.sameAs]) {
      out.groups[key] = out.groups[g.sameAs];
      continue;
    }
    const all = items.filter((it) => it.groupKeys.includes(key));
    const o = { courses: all.length, model: g.model, test: g.test };
    if (g.model === 'market') o.settings = publicSettings(fitMarket(all, defaults));
    else if (g.model === 'global') o.settings = out.settings;
    else {
      const f = fitGroup(all, publicSettings(g.settings), null, g.model === 'learned');
      o.settings = publicSettings(f.weighted);
      if (g.model === 'learned' && f.learned) {
        o.useLearned = true;
        o.learned = f.learned.learned;
        o.settings.placeDiscount = f.learned.placeDiscount;
      }
    }
    out.groups[key] = o;
  }
  out.status = 'ok';
  out.seconds = Math.round((Date.now() - t0) / 1000);
  await writeFile(OUT, JSON.stringify(out));
  const v = out.validation;
  console.log('Confirmation (courses les plus récentes) :');
  for (const k of ['defaults', 'marketOnly', 'calibrated'])
    console.log(
      `  ${k.padEnd(11)} log-loss gagnant ${v[k].winLogLoss}  placé ${v[k].placeLogLoss}  favori gagnant ${(v[k].topWinRate * 100).toFixed(1)} %  base placée ${(v[k].topPlaceRate * 100).toFixed(1)} %`,
    );
  console.log('Modèles retenus :', JSON.stringify(Object.fromEntries(Object.entries(out.groups).map(([g, o]) => [g, o.model]))));
  console.log(`Terminé en ${out.seconds} s.`);
}
// Lancé directement : calibrage. Importé (études) : fonctions seulement.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { outsiderModel, buildDataset, predict, evaluate, fitWeighted, fitLearned, fitMarket, fitPlaceOdds, chooseModels, resolver, backtest };
