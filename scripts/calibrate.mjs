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
import { readFile, writeFile, readdir } from 'node:fs/promises';
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
          if (r.repos == null) {
            const last = lastSeen[p.nom];
            r.repos = last && last < day.date ? daysBetween(last, day.date) : '';
          }
          r._pos = p.arrivee || rankOf[p.num] || 99;
          return r;
        });
        const prep = Turf.prepareRace({ discipline: c.discipline, allocation: c.allocation, runners });
        if (!prep) continue;
        const pos = prep.runners.map((r) => r._pos);
        const winner = pos.indexOf(1);
        if (winner < 0) continue;
        const nPlaces = Turf.placesPayees(prep.runners.length);
        items.push({
          date: day.date,
          heure: c.heure || 0,
          group: Turf.disciplineGroup(c.discipline),
          prep,
          winner,
          nPlaces,
          placed: pos.map((p) => p <= nPlaces),
          rapports: c.rapports || null,
        });
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
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.heure - b.heure));
  return { items, days: days.length };
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
    out[np] = { a: +(my - b * mx).toFixed(4), b: +b.toFixed(4), n: xs.length };
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
];
function selections(st, it, pr, coefs) {
  const R = it.prep.runners;
  const cotes = R.map((r) => num(r.cote));
  const idx = R.map((_, i) => i);
  const argmax = (f) => idx.reduce((b, i) => (f(i) > f(b) ? i : b), 0);
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
  // Rentable « de façon fiable » : ROI positif même en retirant deux erreurs-types.
  res.forEach((r) => (r.validated = r.bets >= 50 && r.roi - 2 * r.roiSE > 0));
  const candidates = res.filter((r) => r.id.startsWith('val_') && r.bets >= 30).sort((a, b) => b.roi - a.roi);
  return { courses: withR.length, strategies: res, best: candidates[0] ? candidates[0].id : null };
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
  placeDiscount: s.placeDiscount,
});

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
  const out = { updated: new Date().toISOString(), days, courses: items.length, minCourses: MIN_COURSES, version: 2 };

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
  const globalTrain = fitWeighted(train, defaults);
  const chosen = {}; // réglages retenus par groupe (version entraînement)
  const groupsOut = {};
  for (const g of ['trot', 'galop']) {
    const tr = train.filter((it) => it.group === g),
      te = test.filter((it) => it.group === g);
    const info = { trainCourses: tr.length, testCourses: te.length };
    let cand = { global: globalTrain };
    if (tr.length >= MIN_GROUP) {
      console.log(`  groupe ${g} : ${tr.length} courses d'entraînement`);
      const f = fitGroup(tr, globalTrain, console.log);
      cand.weighted = f.weighted;
      if (f.learned) cand.learned = f.learned;
    }
    if (te.length) {
      info.test = {};
      for (const [k, s] of Object.entries(cand)) info.test[k] = round(evaluate(te, s));
      info.test.defaults = round(evaluate(te, defaults));
      info.test.marketOnly = round(evaluate(te, Object.assign({}, defaults, { marketWeight: 1 })));
    }
    // Meilleur candidat sur les courses de test du groupe.
    let bestK = 'global';
    if (info.test) for (const k of Object.keys(cand)) if (info.test[k].objective < info.test[bestK].objective) bestK = k;
    info.model = bestK;
    chosen[g] = cand[bestK];
    groupsOut[g] = info;
  }
  const settingsOf = (it) => chosen[it.group];
  const placeOdds = fitPlaceOdds(train);
  out.validation = {
    trainCourses: train.length,
    testCourses: test.length,
    testFrom: test[0].date,
    defaults: round(evaluate(test, defaults)),
    marketOnly: round(evaluate(test, Object.assign({}, defaults, { marketWeight: 1 }))),
    calibrated: round(
      (() => {
        // Mesure combinée avec, pour chaque course, le modèle retenu de son groupe.
        const parts = ['trot', 'galop'].map((g) => [test.filter((it) => it.group === g), chosen[g]]);
        const tot = { n: 0 };
        const acc = {};
        for (const [te, s] of parts) {
          if (!te.length) continue;
          const m = evaluate(te, s);
          for (const k of Object.keys(m)) acc[k] = (acc[k] || 0) + m[k] * te.length;
          tot.n += te.length;
        }
        for (const k of Object.keys(acc)) acc[k] /= tot.n;
        acc.courses = tot.n;
        return acc;
      })(),
    ),
  };
  out.reliability = reliability(test, settingsOf);
  out.backtest = backtest(test, settingsOf, placeOdds);
  out.backtest.from = test[0].date;
  console.log('Simulation de paris (courses récentes) :');
  for (const s of out.backtest.strategies)
    console.log(
      `  ${s.label.padEnd(36)} ${String(s.bets).padStart(5)} paris  ROI ${(s.roi * 100).toFixed(1)} % ± ${((s.roiSE || 0) * 200).toFixed(1)}${s.validated ? '  ✔' : ''}`,
    );

  // 2) Réglages publiés : réajustés sur toutes les courses, avec le type de modèle retenu.
  out.placeOdds = fitPlaceOdds(items);
  const globalAll = fitWeighted(items, globalTrain);
  out.settings = publicSettings(globalAll);
  out.groups = {};
  for (const g of ['trot', 'galop']) {
    const all = items.filter((it) => it.group === g);
    const info = groupsOut[g];
    const o = { courses: all.length, model: info.model, test: info.test || null };
    if (info.model === 'global' || all.length < MIN_GROUP) {
      o.settings = out.settings;
    } else {
      const f = fitGroup(all, chosen[g].learned ? publicSettings(chosen[g]) : chosen[g], null, info.model === 'learned');
      o.settings = publicSettings(f.weighted);
      if (info.model === 'learned' && f.learned) {
        o.useLearned = true;
        o.learned = f.learned.learned;
        o.settings.placeDiscount = f.learned.placeDiscount;
      }
    }
    out.groups[g] = o;
  }
  out.status = 'ok';
  out.seconds = Math.round((Date.now() - t0) / 1000);
  await writeFile(OUT, JSON.stringify(out));
  const v = out.validation;
  console.log('Test (courses récentes) :');
  for (const k of ['defaults', 'marketOnly', 'calibrated'])
    console.log(
      `  ${k.padEnd(11)} log-loss gagnant ${v[k].winLogLoss}  placé ${v[k].placeLogLoss}  favori gagnant ${(v[k].topWinRate * 100).toFixed(1)} %  base placée ${(v[k].topPlaceRate * 100).toFixed(1)} %`,
    );
  console.log('Modèles retenus :', JSON.stringify(Object.fromEntries(Object.entries(out.groups).map(([g, o]) => [g, o.model]))));
  console.log(`Terminé en ${out.seconds} s.`);
}
main();
