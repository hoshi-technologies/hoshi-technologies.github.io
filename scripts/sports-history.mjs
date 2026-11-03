#!/usr/bin/env node
/*
 * Hoshi Sports : étude du football sur l'historique avec les vraies cotes
 * (football-data.co.uk : résultats et cotes Bet365 / Pinnacle / moyenne du marché).
 *
 * Pour chaque championnat, les matchs de plusieurs saisons sont rejoués dans l'ordre :
 * chaque match est prévu AVANT d'être joué (note Elo), puis comparé au marché.
 * Les matchs sont découpés en trois périodes chronologiques :
 *   - réglage (50 %)      : paramètres Elo et part donnée aux cotes ;
 *   - sélection (25 %)    : choix de la meilleure stratégie « valeur » ;
 *   - confirmation (25 %) : vérification sur des matchs qui n'ont servi à aucun choix.
 *
 *   node scripts/sports-history.mjs          → au plus une fois par jour
 *   node scripts/sports-history.mjs --force  → recalcule tout de suite
 *
 * Produit hippique/data/sports/foot-history.json, affiché dans le bilan du football.
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = require(path.join(ROOT, 'hippique/sports.js'));
const OUT_DIR = path.join(ROOT, 'hippique/data/sports');
const OUT = path.join(OUT_DIR, 'foot-history.json');
const CACHE = path.join(OUT_DIR, 'foot-history-matches.json');
const FORCE = process.argv.includes('--force');
const BASE = 'https://www.football-data.co.uk/mmz4281/';
const LEAGUES = [
  { code: 'F1', key: 'fra.1', label: 'Ligue 1' },
  { code: 'E0', key: 'eng.1', label: 'Premier League' },
  { code: 'SP1', key: 'esp.1', label: 'Liga' },
  { code: 'I1', key: 'ita.1', label: 'Serie A' },
  { code: 'D1', key: 'ger.1', label: 'Bundesliga' },
];

const readJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return d;
  }
};
// Saisons : 2019-20 → saison en cours (codes « 1920 », « 2021 »…).
function seasons() {
  const now = new Date();
  const y = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  const out = [];
  for (let s = 2019; s <= y; s++) out.push(String(s % 100).padStart(2, '0') + String((s + 1) % 100).padStart(2, '0'));
  return out;
}
function parseDate(d, t) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(d || '');
  if (!m) return null;
  let yy = +m[3];
  if (yy < 100) yy += 2000;
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(t || '') ? t.split(':').map(Number) : [15, 0];
  return Date.UTC(yy, +m[2] - 1, +m[1], hh, mm);
}
function parseCsv(text, league) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(',');
  const ix = (k) => head.indexOf(k);
  const num = (row, k) => {
    const i = ix(k);
    const v = i >= 0 ? parseFloat(row[i]) : NaN;
    return isFinite(v) && v > 1 ? v : null;
  };
  const out = [];
  for (const l of lines.slice(1)) {
    const r = l.split(',');
    const ftr = r[ix('FTR')];
    if (!/^[HDA]$/.test(ftr || '')) continue;
    const date = parseDate(r[ix('Date')], r[ix('Time')]);
    if (!date) continue;
    // Cotes « avant match » : Bet365, sinon moyenne du marché ; Pinnacle à part (référence du marché).
    const b365 = { h: num(r, 'B365H'), d: num(r, 'B365D'), a: num(r, 'B365A') };
    const avg = { h: num(r, 'AvgH') || num(r, 'BbAvH'), d: num(r, 'AvgD') || num(r, 'BbAvD'), a: num(r, 'AvgA') || num(r, 'BbAvA') };
    const ps = { h: num(r, 'PSH'), d: num(r, 'PSD'), a: num(r, 'PSA') };
    const odds = b365.h && b365.d && b365.a ? b365 : avg.h && avg.d && avg.a ? avg : null;
    out.push({
      league,
      date,
      home: r[ix('HomeTeam')],
      away: r[ix('AwayTeam')],
      score: [+r[ix('FTHG')] || 0, +r[ix('FTAG')] || 0],
      winner: ftr === 'H' ? 'home' : ftr === 'A' ? 'away' : 'draw',
      odds,
      pin: ps.h && ps.d && ps.a ? ps : null,
    });
  }
  return out;
}

async function download() {
  const all = [];
  let ok = 0;
  for (const lg of LEAGUES)
    for (const s of seasons()) {
      try {
        const r = await fetch(`${BASE}${s}/${lg.code}.csv`);
        if (!r.ok) continue;
        const t = Buffer.from(await r.arrayBuffer()).toString('latin1');
        const rows = parseCsv(t, lg.key);
        all.push(...rows);
        ok++;
      } catch {}
    }
  console.log(`${ok} fichiers saisonniers, ${all.length} matchs`);
  return all;
}

// ------------------------------------------------------------------ étude
const OK = { home: 'h', draw: 'd', away: 'a' };
function toEvents(rows) {
  return rows.map((m, i) => ({ id: String(i), date: m.date, status: 'post', winner: m.winner, score: m.score, home: { id: m.league + ':' + m.home }, away: { id: m.league + ':' + m.away }, _m: m }));
}
function evaluate(list, alpha) {
  let ll = 0,
    llMk = 0,
    n = 0,
    fav = 0,
    mkFav = 0;
  for (const x of list) {
    const p = S.blend(x.p, x.mk, alpha);
    ll += S.logLoss(p, x.m.winner);
    llMk += S.logLoss(x.mk, x.m.winner);
    const f = p.h >= p.a ? (p.h >= p.d ? 'home' : 'draw') : p.a >= p.d ? 'away' : 'draw';
    const g = x.mk.h >= x.mk.a ? (x.mk.h >= x.mk.d ? 'home' : 'draw') : x.mk.a >= x.mk.d ? 'away' : 'draw';
    if (f === x.m.winner) fav++;
    if (g === x.m.winner) mkFav++;
    n++;
  }
  return { matches: n, logLoss: +(ll / n).toFixed(4), marketLogLoss: +(llMk / n).toFixed(4), favWon: +(fav / n).toFixed(4), marketFavWon: +(mkFav / n).toFixed(4) };
}
const STRATS = [
  { id: 'fav', label: 'Favori du modèle' },
  ...[1.02, 1.05, 1.1, 1.2].map((t) => ({ id: 'val_' + t, label: `Valeur ≥ ${String(t).replace('.', ',')}`, t })),
  ...[1.05, 1.1].map((t) => ({ id: 'valout_' + t, label: `Valeur ≥ ${String(t).replace('.', ',')}, cote ≥ 3`, t, minOdds: 3 })),
];
function backtest(list, alpha) {
  return STRATS.map((st) => {
    let bets = 0,
      ret = 0,
      wins = 0;
    const pr = [];
    for (const x of list) {
      const p = S.blend(x.p, x.mk, alpha);
      const o = x.m.odds;
      let picks = [];
      if (st.id === 'fav') picks = [p.h >= p.a ? (p.h >= p.d ? 'h' : 'd') : p.a >= p.d ? 'a' : 'd'];
      else picks = ['h', 'd', 'a'].filter((k) => p[k] * o[k] >= st.t && (!st.minOdds || o[k] >= st.minOdds));
      for (const k of picks) {
        const pay = OK[x.m.winner] === k ? o[k] : 0;
        bets++;
        ret += pay;
        if (pay) wins++;
        pr.push(pay - 1);
      }
    }
    const roi = bets ? (ret - bets) / bets : 0;
    const sd = bets > 1 ? Math.sqrt(pr.reduce((a, v) => a + (v - roi) ** 2, 0) / (bets - 1)) : 0;
    return { id: st.id, label: st.label, bets, wins, roi: +roi.toFixed(4), roiSE: bets ? +(sd / Math.sqrt(bets)).toFixed(4) : null };
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const prev = await readJson(OUT, null);
  if (!FORCE && prev && Date.now() - new Date(prev.updated) < 20 * 3600000) {
    console.log('Étude historique récente, rien à faire.');
    return;
  }
  let rows = await download();
  if (rows.length < 1000) {
    const cached = await readJson(CACHE, null);
    if (cached && cached.length > rows.length) rows = cached;
  } else await writeFile(CACHE, JSON.stringify(rows));
  rows = rows.filter((m) => m.odds).sort((a, b) => a.date - b.date);
  if (rows.length < 1000) {
    console.error('Pas assez de matchs avec cotes : étude impossible.');
    process.exitCode = 1;
    return;
  }
  const events = toEvents(rows);
  // Première saison de chaque championnat : rodage des notes, non comptée.
  const burn = Math.floor(events.length / seasons().length);
  const c1 = burn + Math.floor((events.length - burn) * 0.5),
    c2 = burn + Math.floor((events.length - burn) * 0.75);
  const cal = S.calibrate(events.slice(0, c1), 'foot');
  const params = cal.params;
  const preds = [];
  S.replay(events, params, (e, pr) => {
    preds.push({ i: +e.id, p: pr, m: e._m, mk: S.impliedProbs(e._m.odds) });
  });
  preds.sort((a, b) => a.i - b.i);
  const train = preds.slice(burn, c1),
    sel = preds.slice(c1, c2),
    conf = preds.slice(c2);
  // Part des cotes dans la combinaison, réglée sur la période de réglage.
  let alpha = 0,
    best = Infinity;
  for (const a of [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    const l = evaluate(train, a).logLoss;
    if (l < best) (best = l), (alpha = a);
  }
  const bSel = backtest(sel, alpha);
  const bConf = backtest(conf, alpha);
  const cand = bSel.filter((x) => x.id !== 'fav' && x.bets >= 100 && x.roi > 0).sort((a, b) => b.roi - a.roi)[0];
  const strategies = bConf.map((x) => {
    const s = bSel.find((y) => y.id === x.id);
    const chosen = cand && cand.id === x.id;
    return Object.assign({}, x, { roiSelection: s.roi, betsSelection: s.bets, chosen, validated: !!(chosen && x.bets >= 100 && x.roi - 2 * x.roiSE > 0) });
  });
  const perLeague = LEAGUES.map((lg) => {
    const L = conf.filter((x) => x.m.league === lg.key);
    return L.length ? Object.assign({ key: lg.key, label: lg.label }, evaluate(L, alpha)) : null;
  }).filter(Boolean);
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
  const out = {
    updated: new Date().toISOString(),
    source: 'football-data.co.uk (cotes Bet365 avant match)',
    seasons: seasons().length,
    matches: rows.length,
    periods: {
      train: { from: fmt(train[0].m.date), matches: train.length },
      selection: { from: fmt(sel[0].m.date), matches: sel.length },
      confirmation: { from: fmt(conf[0].m.date), to: fmt(conf[conf.length - 1].m.date), matches: conf.length },
    },
    params,
    alpha,
    confirmation: {
      modelOnly: evaluate(conf, 0),
      marketOnly: evaluate(conf, 1),
      blend: evaluate(conf, alpha),
    },
    perLeague,
    strategies,
    validated: strategies.some((x) => x.validated),
  };
  await writeFile(OUT, JSON.stringify(out));
  const c = out.confirmation;
  console.log(`Réglages Elo ${JSON.stringify(params)}, part des cotes ${alpha}`);
  console.log(`Confirmation (${conf.length} matchs) : log-loss modèle ${c.modelOnly.logLoss} · marché ${c.marketOnly.logLoss} · combiné ${c.blend.logLoss}`);
  for (const x of strategies)
    console.log(
      `  ${x.label.padEnd(30)} sélection ${String(x.betsSelection).padStart(5)} paris ${(x.roiSelection * 100).toFixed(1).padStart(6)} % | confirmation ${String(x.bets).padStart(5)} paris ${(x.roi * 100).toFixed(1).padStart(6)} % ± ${((x.roiSE || 0) * 200).toFixed(1)}${x.chosen ? ' ← choisie' : ''}${x.validated ? ' ✔' : ''}`,
    );
}
main();
