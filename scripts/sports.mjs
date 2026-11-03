#!/usr/bin/env node
/*
 * Hoshi Sports : récupération des matchs (API publique ESPN), notes Elo, pronostics figés
 * avant le coup d'envoi et bilan, pour chaque sport de hippique/sports.js.
 *
 *   node scripts/sports.mjs              → matchs de J−3 à J+7, modèle, pronostics, bilan
 *   node scripts/sports.mjs --quick      → seulement aujourd'hui et demain (cotes avant match)
 *   node scripts/sports.mjs --backfill N → historique des N derniers jours (notes Elo)
 *
 * Fichiers produits dans hippique/data/sports/ :
 *   <sport>-events.json  tous les matchs connus (historique pour l'Elo)
 *   <sport>.json         ce qu'affiche la page : matchs à venir et récents avec probabilités,
 *                        classements, fiabilité du modèle, bilan des pronostics figés
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = require(path.join(ROOT, 'hippique/sports.js'));
const OUT = path.join(ROOT, 'hippique/data/sports');
const API = 'https://site.api.espn.com/apis/site/v2/sports/';
const KEEP_DAYS = 400;
const FREEZE_BEFORE_MS = 3 * 3600000; // pronostic enregistré dans les 3 h avant le début
const ODDS_T_MS = 15 * 60000; // cote « au moment de parier » : au moins 15 min avant

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const bi = args.indexOf('--backfill');
const BACKFILL = bi >= 0 ? Math.min(KEEP_DAYS, parseInt(args[bi + 1], 10) || 0) : 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const readJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return d;
  }
};
async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'hoshi-sports/1.0' } });
      if (r.status === 400 || r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(800 * 2 ** i);
    }
  }
}
async function pool(items, n, fn) {
  let k = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < items.length) {
        const i = k++;
        await fn(items[i]);
        await sleep(80);
      }
    }),
  );
}

// ------------------------------------------------------------------ lecture ESPN
function parseOdds(o) {
  if (!o) return null;
  const ml = (x) => S.americanToDecimal(x);
  let h = o.homeTeamOdds && ml(o.homeTeamOdds.moneyLine);
  let a = o.awayTeamOdds && ml(o.awayTeamOdds.moneyLine);
  let d = o.drawOdds && ml(o.drawOdds.moneyLine);
  const m = o.moneyline;
  const pick = (side) => side && ml((side.close && side.close.odds) || (side.open && side.open.odds) || side.odds);
  if (!h && m) h = pick(m.home);
  if (!a && m) a = pick(m.away);
  if (!d && m) d = pick(m.draw);
  if (!h || !a) return null;
  const out = { h, a };
  if (d) out.d = d;
  out.src = (o.provider && (o.provider.displayName || o.provider.name)) || '';
  return out;
}
function side(c) {
  const t = c.team || c.athlete || {};
  return { id: String(c.id || t.id || t.guid || ''), name: t.displayName || t.name || t.fullName || '?', abbr: t.abbreviation || t.shortName || '' };
}
function teamEvents(j, league) {
  const out = [];
  for (const ev of (j && j.events) || []) {
    const comp = (ev.competitions || [])[0];
    if (!comp) continue;
    const cs = comp.competitors || [];
    const hc = cs.find((c) => c.homeAway === 'home') || cs[0];
    const ac = cs.find((c) => c.homeAway === 'away') || cs[1];
    if (!hc || !ac) continue;
    const st = ((comp.status || ev.status || {}).type || {});
    const e = {
      id: String(ev.id),
      league: league.key,
      date: Date.parse(comp.date || ev.date),
      status: st.state || 'pre',
      detail: st.shortDetail || '',
      home: side(hc),
      away: side(ac),
      neutral: !!comp.neutralSite,
      name: comp.altGameNote || '',
    };
    if (st.completed || st.state === 'post') {
      const sh = parseFloat(hc.score),
        sa = parseFloat(ac.score);
      if (isFinite(sh) && isFinite(sa)) e.score = [sh, sa];
      e.winner = hc.winner ? 'home' : ac.winner ? 'away' : e.score && e.score[0] === e.score[1] ? 'draw' : null;
      e.status = 'post';
    }
    const o = parseOdds((comp.odds || []).filter(Boolean)[0]);
    if (o) e.odds = o;
    out.push(e);
  }
  return out;
}
function tennisEvents(j, league) {
  const out = [];
  for (const ev of (j && j.events) || []) {
    for (const g of ev.groupings || []) {
      const slug = (g.grouping && g.grouping.slug) || '';
      if (!/singles/.test(slug)) continue;
      for (const comp of g.competitions || []) {
        const cs = (comp.competitors || []).slice().sort((x, y) => (x.order || 0) - (y.order || 0));
        if (cs.length !== 2) continue;
        const st = ((comp.status || {}).type || {});
        const e = {
          id: 't' + comp.id,
          league: league.key,
          date: Date.parse(comp.date || comp.startDate || ev.date),
          status: st.state || 'pre',
          detail: st.shortDetail || '',
          home: side(cs[0]),
          away: side(cs[1]),
          neutral: true,
          name: ev.name + (comp.round && comp.round.displayName ? ' · ' + comp.round.displayName : ''),
        };
        if (!e.home.id || !e.away.id || /TBD|Bye/i.test(e.home.name + e.away.name)) continue;
        if (st.completed || st.state === 'post') {
          e.status = 'post';
          e.winner = cs[0].winner ? 'home' : cs[1].winner ? 'away' : null;
        }
        out.push(e);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ principal
async function main() {
  await mkdir(OUT, { recursive: true });
  const now = Date.now();
  const day = 86400000;
  let from = QUICK ? 0 : -3,
    to = QUICK ? 1 : 7;
  if (BACKFILL) from = -BACKFILL;
  const dates = [];
  for (let k = from; k <= to; k++) dates.push(ymd(new Date(now + k * day)));

  let failures = 0,
    calls = 0;
  for (const [sportKey, sport] of Object.entries(S.SPORTS)) {
    const file = path.join(OUT, sportKey + '-events.json');
    const store = await readJson(file, { events: {}, leagues: {} });
    store.leagues = store.leagues || {};
    const jobs = [];
    for (const lg of sport.leagues) for (const d of dates) jobs.push({ lg, d });
    await pool(jobs, 4, async ({ lg, d }) => {
      calls++;
      let j;
      try {
        j = await getJson(`${API}${lg.espn}/scoreboard?dates=${d}`);
      } catch (e) {
        failures++;
        return;
      }
      if (!j) return;
      const name = j.leagues && j.leagues[0] && j.leagues[0].name;
      if (name) store.leagues[lg.key] = { key: lg.key, label: lg.label, name };
      const evs = sport.individual ? tennisEvents(j, lg) : teamEvents(j, lg);
      for (const e of evs) {
        if (!e.date) continue;
        const old = store.events[e.id] || {};
        const m = Object.assign({}, old, e);
        if (old.prono) m.prono = old.prono; // pronostic figé : jamais modifié
        if (!e.odds && old.odds) m.odds = old.odds;
        // Cote au moment de parier : dernière vue au moins 15 min avant le début, figée ensuite.
        if (e.odds && e.status === 'pre' && e.date - Date.now() >= ODDS_T_MS) (m.oddsT = e.odds), (m.oddsTAt = Date.now());
        store.events[e.id] = m;
      }
    });
    // Ménage
    const limit = now - KEEP_DAYS * day;
    for (const [id, e] of Object.entries(store.events)) if (e.date < limit) delete store.events[id];
    const events = Object.values(store.events);

    // Modèle : calibrage puis notes finales
    const cal = S.calibrate(events, sportKey);
    const params = cal.params;
    const fin = S.replay(events, params);
    // Fiabilité : prévisions faites avant chaque match, sur la seconde moitié de l'historique
    const done = events.filter((e) => e.status === 'post' && e.winner).length;
    let k = 0;
    const rel = { matches: 0, favWon: 0, logLoss: 0, homeRate: 0, buckets: Array.from({ length: 10 }, () => ({ n: 0, p: 0, w: 0 })) };
    S.replay(events, params, (e, pr, nh, na) => {
      k++;
      if (k < done * 0.4 || (sportKey === 'tennis' && (nh < 3 || na < 3))) return;
      rel.matches++;
      const fav = pr.h >= pr.a ? (pr.h >= pr.d ? 'home' : 'draw') : pr.a >= pr.d ? 'away' : 'draw';
      if (fav === e.winner) rel.favWon++;
      if (e.winner === 'home') rel.homeRate++;
      rel.logLoss += S.logLoss(pr, e.winner);
      const pf = Math.max(pr.h, pr.a);
      const b = rel.buckets[Math.min(9, Math.floor(pf * 10))];
      b.n++;
      b.p += pf;
      b.w += (pr.h >= pr.a ? e.winner === 'home' : e.winner === 'away') ? 1 : 0;
    });
    if (rel.matches) (rel.logLoss = +(rel.logLoss / rel.matches).toFixed(4)), (rel.homeRate = +(rel.homeRate / rel.matches).toFixed(3));
    rel.buckets = rel.buckets.map((b, i) => ({ from: i / 10, n: b.n, predicted: b.n ? +(b.p / b.n).toFixed(3) : null, observed: b.n ? +(b.w / b.n).toFixed(3) : null }));

    // Pronostics des matchs à venir, figés dans les 3 h avant le début
    const R = (id) => (fin.ratings[id] != null ? fin.ratings[id] : 1500);
    const G = (id) => fin.games[id] || 0;
    for (const e of events) {
      if (e.status !== 'pre' || e.date <= now) continue;
      const p = S.matchProbs(R(e.home.id), R(e.away.id), params, e.neutral);
      e.model = p;
      e.games = [G(e.home.id), G(e.away.id)];
      if (e.date - now <= FREEZE_BEFORE_MS)
        e.prono = {
          at: now,
          p: { h: +p.h.toFixed(4), d: +p.d.toFixed(4), a: +p.a.toFixed(4) },
          ratings: [Math.round(R(e.home.id)), Math.round(R(e.away.id))],
          games: e.games,
          odds: e.oddsT || e.odds || null,
        };
    }
    await writeFile(file, JSON.stringify(store));

    // Bilan des pronostics figés
    const bil = { matches: 0, favWon: 0, expected: 0, logLoss: 0, withOdds: 0, mkFavWon: 0, stake: 0, ret: 0, valBets: 0, valRet: 0, days: {} };
    const recent = [];
    for (const e of events) {
      if (!e.prono || e.status !== 'post' || !e.winner) continue;
      const p = e.prono.p;
      const fav = p.h >= p.a ? (p.h >= (p.d || 0) ? 'home' : 'draw') : p.a >= (p.d || 0) ? 'away' : 'draw';
      const pf = fav === 'home' ? p.h : fav === 'away' ? p.a : p.d;
      const dk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(e.date));
      const dd = (bil.days[dk] ||= { matches: 0, favWon: 0, expected: 0, stake: 0, ret: 0 });
      bil.matches++, dd.matches++;
      bil.expected += pf;
      dd.expected += pf;
      if (fav === e.winner) bil.favWon++, dd.favWon++;
      bil.logLoss += S.logLoss({ h: p.h, d: p.d || 0, a: p.a }, e.winner);
      const o = e.prono.odds;
      const oKey = { home: 'h', away: 'a', draw: 'd' };
      if (o) {
        bil.withOdds++;
        const ip = S.impliedProbs(o);
        const mf = ip && (ip.h >= ip.a ? (ip.h >= (ip.d || 0) ? 'home' : 'draw') : ip.a >= (ip.d || 0) ? 'away' : 'draw');
        if (mf === e.winner) bil.mkFavWon++;
        const of = o[oKey[fav]];
        if (of) {
          bil.stake++, dd.stake++;
          if (fav === e.winner) (bil.ret += of), (dd.ret += of);
        }
        for (const s of ['home', 'draw', 'away']) {
          const ps = s === 'home' ? p.h : s === 'away' ? p.a : p.d;
          const os = o[oKey[s]];
          if (ps && os && ps * os >= 1.05) {
            bil.valBets++;
            if (s === e.winner) bil.valRet += os;
          }
        }
      }
      recent.push({ id: e.id, league: e.league, date: e.date, home: e.home.name, away: e.away.name, score: e.score || null, winner: e.winner, fav, p: +pf.toFixed(3), odds: o ? o[oKey[fav]] || null : null });
    }
    if (bil.matches) bil.logLoss = +(bil.logLoss / bil.matches).toFixed(4);
    recent.sort((a, b) => b.date - a.date);

    // Ce qu'affiche la page
    const view = {
      updated: new Date().toISOString(),
      sport: sportKey,
      params,
      calLoss: +cal.loss.toFixed(4),
      reliability: rel,
      leagues: sport.leagues.map((l) => Object.assign({ matches: events.filter((e) => e.league === l.key).length }, store.leagues[l.key] || l)),
      upcoming: events
        .filter((e) => e.status !== 'post' && e.date > now - 4 * 3600000 && e.date < now + 8 * day)
        .sort((a, b) => a.date - b.date)
        .slice(0, 400)
        .map((e) => ({
          id: e.id,
          league: e.league,
          date: e.date,
          status: e.status,
          detail: e.detail,
          name: e.name,
          home: e.home,
          away: e.away,
          neutral: e.neutral,
          model: e.prono && e.date <= now ? e.prono.p : e.model || null,
          frozenAt: e.prono ? e.prono.at : null,
          games: e.games || null,
          ratings: [Math.round(R(e.home.id)), Math.round(R(e.away.id))],
          odds: e.odds || null,
          oddsT: e.oddsT || null,
        })),
      results: events
        .filter((e) => e.status === 'post' && e.date > now - 3 * day)
        .sort((a, b) => b.date - a.date)
        .slice(0, 200)
        .map((e) => ({ id: e.id, league: e.league, date: e.date, name: e.name, home: e.home, away: e.away, score: e.score || null, winner: e.winner, prono: e.prono ? { p: e.prono.p, at: e.prono.at, odds: e.prono.odds } : null })),
      ratings: Object.fromEntries(
        sport.leagues.map((l) => {
          const ids = new Map();
          for (const e of events) if (e.league === l.key) for (const s of [e.home, e.away]) ids.set(s.id, s.name);
          const rows = [...ids]
            .filter(([id]) => fin.games[id] >= (sport.individual ? 8 : 3))
            .map(([id, name]) => ({ name, r: Math.round(R(id)), n: G(id) }))
            .sort((a, b) => b.r - a.r)
            .slice(0, sport.individual ? 50 : 30);
          return [l.key, rows];
        }),
      ),
      bilan: Object.assign({}, bil, { recent: recent.slice(0, 80) }),
    };
    await writeFile(path.join(OUT, sportKey + '.json'), JSON.stringify(view));
    console.log(
      `${sport.label} : ${events.length} matchs (${done} terminés), ${view.upcoming.length} à venir · ` +
        `fiabilité : favori gagnant ${rel.matches ? Math.round((100 * rel.favWon) / rel.matches) : '—'} % sur ${rel.matches} · ` +
        `réglages ${JSON.stringify(params)}`,
    );
  }
  console.log(`${calls} appels, ${failures} échecs`);
  if (calls && failures > calls * 0.5) {
    console.error('Plus de la moitié des appels ont échoué : la source a peut-être changé.');
    process.exitCode = 1;
  }
}
main();
