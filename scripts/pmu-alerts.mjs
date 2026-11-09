#!/usr/bin/env node
/*
 * Notifications Hoshi Turf, envoyées après chaque mise à jour des cotes :
 *
 *  🔔 Pari validé  : un pari des courses qui partent bientôt correspond à une stratégie
 *                   VALIDÉE par la simulation (rentable même après retrait de la marge de hasard).
 *  📋 Sélection    : une fois par jour, vers 9 h, les courses où notre favori est le plus sûr.
 *  ⏰ Rappel       : 10 à 40 min avant chaque course de la sélection, avec la cote à jour
 *                   (et 💰 si la cote paie plus que notre estimation, sans validation).
 *
 * Le cœur de l'outil reste le pari validé ; sélection et rappels sont indicatifs.
 *
 * - Envoie une notification sur le téléphone via ntfy (https://ntfy.sh) si le secret
 *   NTFY_TOPIC est défini dans le dépôt (Settings → Secrets → Actions).
 * - Écrit hippique/data/alerts.json, lu par la page (alertes dans le navigateur).
 *
 * Aucune alerte n'est envoyée tant qu'aucune stratégie n'est validée.
 *   ALERT_TEST=1 node scripts/pmu-alerts.mjs  → envoie une notification de test.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Turf = require(path.join(ROOT, 'hippique/engine.js'));
const DATA = path.join(ROOT, 'hippique/data');
const OUT = path.join(DATA, 'alerts.json');
const PAGE = 'https://hoshi-technologies.github.io/hippique/';
const TOPIC = (process.env.NTFY_TOPIC || '').trim();
const WINDOW_MIN = Number(process.env.ALERT_WINDOW_MIN) || 45; // courses qui partent dans les 45 minutes
const SELECT_MIN = Number(process.env.SELECT_MIN) || 0.6; // chances de placé minimum pour la sélection
const SELECT_MAX = Number(process.env.SELECT_MAX) || 10; // courses maximum dans la sélection
const VALUE_MIN = 1.05;
const CHOICE_MAX = Number(process.env.CHOICE_MAX) || 5; // Choix Hoshi annoncés le matin // « cote intéressante » (indicatif)
const ALL_COUNTRIES = process.env.ALERT_ALL_COUNTRIES === '1';
const link = (date, r, c) => `${PAGE}#${date}/R${r}C${c}`;
const MAX_STAKE = 0.02, KELLY_FRAC = 0.25;

const parisDate = (o = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + o * 86400000));
const hour = (ms) =>
  new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const fr = (x, d = 1) => x.toFixed(d).replace('.', ',');
const readJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, 'utf8'));
  } catch {
    return d;
  }
};

async function notify(title, message, tags = 'horse_racing', opts = {}) {
  if (!TOPIC) {
    console.log('  (NTFY_TOPIC absent : notification non envoyée)\n  ' + title + ' — ' + message);
    return false;
  }
  const res = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: TOPIC, title, message, tags: tags.split(','), priority: opts.priority || 4, click: opts.click || PAGE }),
  });
  console.log('  notification envoyée : ' + res.status);
  return res.ok;
}

// Mêmes compléments que la page : taux jockey/entraîneur tirés des statistiques archivées.
let RATINGS = {};
function enrich(partants, stats, dateIso) {
  return partants.map((p) => {
    const r = Object.assign({}, p);
    const el = RATINGS[p.nom];
    if (el) (r.rating = el[0]), (r.ratingN = el[1]);
    const j = Turf.statRate(stats && stats.jockeys && stats.jockeys[p.jockeyNom]);
    const e = Turf.statRate(stats && stats.entraineurs && stats.entraineurs[p.entraineurNom]);
    if (j != null) r.jockey = j;
    if (e != null) r.entraineur = e;
    if (r.repos == null && stats && stats.chevaux && stats.chevaux[p.nom] && stats.chevaux[p.nom] < dateIso)
      r.repos = Math.round((new Date(dateIso + 'T12:00:00Z') - new Date(stats.chevaux[p.nom] + 'T12:00:00Z')) / 86400000);
    return r;
  });
}

/** Analyse d'une course avec les réglages calibrés de sa discipline. */
function analyze(c, cal, stats, today) {
  const settings = Turf.settingsFor(cal, { discipline: c.discipline, categorie: c.categorie });
  return Turf.analyzeRace(
    { discipline: c.discipline, allocation: c.allocation, runners: enrich(c.partants, stats, today) },
    Object.assign({}, settings || {}, { simulations: 0 }),
  );
}
const pp = (x) => (x.pPlace != null ? x.pPlace : x.pTop3);
/** Choix Hoshi décidé sur les cotes du matin (cote du moment dans coteLive). */
function choice(c, cal, stats, today) {
  const settings = Turf.settingsFor(cal, { discipline: c.discipline, categorie: c.categorie });
  return Turf.hoshiChoiceMorning({ discipline: c.discipline, allocation: c.allocation, runners: enrich(c.partants, stats, today) }, settings);
}
const live = (k) => Number(k.x.runner.coteLive || k.cote);
/** Outsiders Hoshi d'une course (cote du matin, modèle du calibrage). */
function outsiders(c, cal, stats, today) {
  const L = cal && cal.outsider;
  if (!L) return [];
  return Turf.outsiderPicks({ discipline: c.discipline, allocation: c.allocation, runners: enrich(c.partants, stats, today) }, L);
}
const OUT_STAKE = '1 € gagnant + 1 € placé';

/** Sélection du jour (une fois, vers 9 h) et rappels avant les courses sélectionnées. */
async function selectionAndReminders(state, today, cal, stats, day) {
  if (!day) return;
  const now = Number(process.env.ALERT_NOW) || Date.now();
  const parisHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' }).format(now),
  );
  const rows = [];
  for (const reu of day.reunions) {
    if (!ALL_COUNTRIES && reu.pays && reu.pays !== 'FRA') continue;
    for (const c of reu.courses) {
      if (!c.heure || c.arrivee || c.heure < now || !c.partants || !c.partants.length) continue;
      const a = analyze(c, cal, stats, today);
      if (a.error) continue;
      const top = a.runners.slice().sort((x, y) => pp(y) - pp(x))[0];
      rows.push({ reu, c, a, top, p: pp(top), ch: choice(c, cal, stats, today), out: outsiders(c, cal, stats, today) });
    }
  }
  // Sélection : courses où notre favori a au moins SELECT_MIN de chances d'être placé.
  state.selection = state.selection || {};
  if (!state.selection[today] && parisHour >= 9) {
    const sel = rows
      .filter((x) => x.p >= SELECT_MIN)
      .sort((x, y) => y.p - x.p)
      .slice(0, SELECT_MAX)
      .sort((x, y) => x.c.heure - y.c.heure);
    state.selection[today] = sel.map((x) => `R${x.reu.r}C${x.c.c}`);
    // Outsiders Hoshi du jour : la seule méthode positive sur 10 ans d'historique.
    const outs = rows.filter((x) => x.out.length).sort((x, y) => x.c.heure - y.c.heure);
    state.choix = state.choix || {};
    state.choix[today] = outs.map((x) => `R${x.reu.r}C${x.c.c}`);
    if (sel.length || outs.length) {
      const lines = [];
      if (outs.length) {
        lines.push(`🎯 Outsiders Hoshi (${OUT_STAKE} sur chacun) :`);
        for (const x of outs)
          for (const o of x.out)
            lines.push(`${hour(x.c.heure)} R${x.reu.r}C${x.c.c} ${x.reu.hippodrome} — n°${o.runner.num} ${o.runner.nom}, cote du matin ${fr(o.cote)} (×${fr(o.ratio, 1)} ce que dit la cote)`);
        lines.push('Gros outsiders : ils gagnent rarement (4 à 6 %), mais ont rapporté +70 à +96 % des mises sur 10 ans. Jouez-les tous, même mise, sans augmenter après une perte.');
      }
      if (sel.length) {
        lines.push((outs.length ? '\n' : '') + '📋 Pour info, nos chevaux les plus sûrs (placé, perd ≈ 5 % à long terme) :');
        for (const x of sel) lines.push(`${hour(x.c.heure)} R${x.reu.r}C${x.c.c} ${x.reu.hippodrome} — n°${x.top.runner.num} ${x.top.runner.nom} (${Math.round(x.p * 100)} % placé)`);
      }
      const msg = lines.join('\n') + '\nRappel avant chaque course des Outsiders.';
      console.log('SÉLECTION\n' + msg);
      const no = outs.reduce((a, x) => a + x.out.length, 0);
      await notify(no ? `🎯 ${no} Outsider${no > 1 ? 's' : ''} Hoshi aujourd'hui` : '📋 Sélection du jour', msg, 'clipboard', { priority: 3 });
    } else {
      await notify('📋 Sélection du jour', `Aucune course où notre favori dépasse ${Math.round(SELECT_MIN * 100)} % de chances d'être placé.`, 'clipboard', { priority: 2 });
    }
  }
  // Rappels : 10 à 40 minutes avant chaque course où figure un Outsider Hoshi.
  for (const x of rows) {
    const mins = (x.c.heure - now) / 60000;
    if (mins < 10 || mins > 40) continue;
    const id = `R${x.reu.r}C${x.c.c}`;
    const key = `${today}-${id}-rappel`;
    if (state.sent[key]) continue;
    // Rappels : seulement les courses avec un Outsider Hoshi (les autres conseils perdent à long terme).
    if (!x.out.length) continue;
    const t = x.top.runner;
    let msg = x.out
      .map((o) => `🎯 Outsider : n°${o.runner.num} ${o.runner.nom} — ${OUT_STAKE}. Cote du matin ${fr(o.cote)}, actuelle ${fr(o.coteLive)}.`)
      .join('\n');
    msg += `\nPour info, le plus sûr : n°${t.num} ${t.nom} (${Math.round(x.p * 100)} % placé)`;
    if (t.cote) {
      const est = Turf.estimatePlaceOdds(t.cote, x.a.placesPayees, cal && cal.placeOdds);
      msg += `, cote ${fr(Number(t.cote))}` + (est ? ` (placé estimé ${fr(est, 2)} €)` : '');
    } else msg += ' (cotes pas encore publiées)';
    msg += '.';
    const title = `⏰ ${hour(x.c.heure)} R${x.reu.r}C${x.c.c} ${x.reu.hippodrome} — dans ${Math.round(mins)} min`;
    console.log('RAPPEL ' + title + ' — ' + msg);
    await notify(title, msg, 'dart', { priority: 4, click: link(today, x.reu.r, x.c.c) });
    state.sent[key] = new Date().toISOString();
  }
  for (const d of Object.keys(state.selection)) if (d < parisDate(-3)) delete state.selection[d];
  for (const d of Object.keys(state.choix || {})) if (d < parisDate(-3)) delete state.choix[d];
}

/**
 * Pronostic figé : à chaque passage AVANT le départ, le pronostic de la course est enregistré
 * dans le fichier du jour ; une fois l'heure de départ passée, il n'est plus jamais modifié.
 * La page l'affiche pour les courses parties et s'en sert pour comparer avec l'arrivée.
 */
async function freezePronos(day, cal, stats, today, state) {
  const now = Date.now();
  let n = 0;
  for (const reu of day.reunions)
    for (const c of reu.courses) {
      if (!c.heure || c.heure <= now || c.arrivee || !c.partants || !c.partants.length) continue;
      if (c.heure - now > 3 * 3600000) continue; // inutile trop longtemps à l'avance
      const a = analyze(c, cal, stats, today);
      if (a.error) continue;
      c.prono = {
        at: now,
        placesPayees: a.placesPayees,
        selected: ((state && state.selection && state.selection[today]) || []).includes(`R${reu.r}C${c.c}`),
        runners: a.runners.map((x) => ({
          num: x.runner.num,
          note: +x.note.toFixed(1),
          pWin: +x.pWin.toFixed(4),
          pPlace: x.pPlace == null ? null : +x.pPlace.toFixed(4),
          pTop3: +x.pTop3.toFixed(4),
          pMarket: x.pMarket == null ? null : +x.pMarket.toFixed(4),
          cote: x.runner.cote || null,
        })),
      };
      // Choix Hoshi au moment du départ (figé comme le reste).
      // Décidé sur les cotes du matin (voir Turf.morningRunners) ; cote = cote du matin, coteLive = cote au départ.
      const ch = choice(c, cal, stats, today);
      const fz = (k) => (k ? { num: k.x.runner.num, p: +k.p.toFixed(4), ratio: +k.ratio.toFixed(3), cote: k.cote, coteLive: live(k) || null, matin: true } : null);
      c.prono.choix = {
        g: fz(ch.g),
        p: fz(ch.p),
        announced: ((state && state.choix && state.choix[today]) || []).includes(`R${reu.r}C${c.c}`),
      };
      // Outsiders Hoshi (cote du matin), figés eux aussi.
      if (!ALL_COUNTRIES && reu.pays && reu.pays !== 'FRA') c.prono.outsiders = [];
      else
        c.prono.outsiders = outsiders(c, cal, stats, today).map((o) => ({
          num: o.runner.num,
          p: +o.p.toFixed(4),
          ratio: +o.ratio.toFixed(3),
          cote: o.cote,
          coteLive: o.coteLive || null,
        }));
      // Quinté+ : nos 5 chevaux, l'ordre proposé et les chances de chaque formule, figés aussi.
      if (c.quinte) {
        const q = Turf.quinteAnalysis(
          a.runners.map((x) => x.pWin),
          { placeDiscount: a.settings.placeDiscount },
        );
        if (q) {
          const numOf = (i) => a.runners[i].runner.num;
          c.prono.quinte = {
            order: q.order.slice(0, 10).map(numOf),
            pTop5: Object.fromEntries(q.order.map((i) => [numOf(i), +q.pTop5[i].toFixed(4)])),
            picks: q.picks.map(numOf),
            ordre: q.ordre.map(numOf),
            p: Object.fromEntries(Object.entries(q.p).map(([k, v]) => [k, +v.toFixed(5)])),
            combines: q.combines.map((x) => ({
              n: x.n,
              nums: x.idx.map(numOf),
              combos: x.combos,
              pDesordre: +x.pDesordre.toFixed(4),
              pBonus4: +x.pBonus4.toFixed(4),
              pBonus3: +x.pBonus3.toFixed(4),
            })),
          };
          // Quinté « valeur » (chances × rapport attendu), figé lui aussi.
          if (a.market) {
            const v = Turf.quinteValue(
              a.runners.map((x) => x.pWin),
              a.runners.map((x) => (Number(x.runner.cote) > 1 ? x.pMarket : null)),
              { placeDiscount: a.settings.placeDiscount, base: q.picks },
            );
            if (v) {
              const r = (x) => ({ p: x.p, pay: Object.fromEntries(Object.entries(x.pay).map(([k, y]) => [k, +y.toFixed(2)])), ev: +x.ev.toFixed(4) });
              c.prono.quinte.valeur = { picks: v.best.idx.map(numOf), best: r(v.best), base: r(v.base) };
            }
          }
        }
      }
      n++;
    }
  if (n) {
    await writeFile(path.join(DATA, today + '.json'), JSON.stringify(day));
    console.log(`${n} pronostic(s) enregistré(s) avant le départ`);
  }
}

async function main() {
  // Variables de test : ALERT_DATE (AAAA-MM-JJ) et ALERT_NOW (horodatage ms).
  const today = process.env.ALERT_DATE || parisDate(0);
  const state = await readJson(OUT, { sent: {}, alerts: [] });
  state.sent = state.sent || {};
  state.alerts = state.alerts || [];

  if (process.env.ALERT_TEST === '1' || process.env.ALERT_TEST === 'true') {
    await notify('Hoshi Turf · test', 'Les alertes fonctionnent. Vous serez prévenu quand un pari validé apparaîtra.', 'white_check_mark');
  }

  const cal = await readJson(process.env.CALIBRATION_FILE || path.join(DATA, 'calibration.json'), null);
  const stats = await readJson(path.join(DATA, 'stats.json'), null);
  RATINGS = ((await readJson(path.join(DATA, 'ratings.json'), null)) || {}).ratings || {};
  const day = await readJson(path.join(DATA, today + '.json'), null);
  const strat = Turf.validatedStrategy(cal);
  state.updated = new Date().toISOString();
  state.strategy = strat ? { label: strat.label, type: strat.type, threshold: strat.threshold, roi: strat.roi, bets: strat.bets } : null;

  if (!strat) console.log('Aucune stratégie validée par la simulation : pas d\'alerte.');
  else if (!day) console.log('Pas de programme pour aujourd\'hui.');
  else {
    const now = Number(process.env.ALERT_NOW) || Date.now();
    for (const reu of day.reunions)
      for (const c of reu.courses) {
        if (!c.heure || c.arrivee || c.heure < now || c.heure > now + WINDOW_MIN * 60000) continue;
        if (!c.partants || !c.partants.length) continue;
        const settings = Turf.settingsFor(cal, { discipline: c.discipline, categorie: c.categorie });
        const a = Turf.analyzeRace(
          { discipline: c.discipline, allocation: c.allocation, runners: enrich(c.partants, stats, today) },
          Object.assign({}, settings || {}, { simulations: 0 }),
        );
        let bets;
        if (strat.id.startsWith('choix_')) {
          // Stratégie « Choix Hoshi » validée : on joue le Choix Hoshi de la course.
          const ch = choice(c, cal, stats, today)[strat.type];
          const o = ch && (strat.type === 'g' ? live(ch) : Turf.estimatePlaceOdds(live(ch), a.placesPayees, cal && cal.placeOdds));
          bets = ch && o ? [{ x: ch.x, type: strat.type, p: ch.p, o, ev: ch.p * o, kelly: Math.max(0.02, Turf.kelly(ch.p, o)) }] : [];
        } else bets = Turf.valueBets(a, cal, { minEdge: strat.threshold, types: strat.type });
        for (const b of bets) {
          const key = `${today}-R${reu.r}C${c.c}-${b.x.runner.num}-${b.type}`;
          if (state.sent[key]) continue;
          const stakePct = Math.min(MAX_STAKE, KELLY_FRAC * b.kelly);
          if (stakePct < 0.002) continue;
          const alert = {
            key,
            date: today,
            r: reu.r,
            c: c.c,
            heure: c.heure,
            hippodrome: reu.hippodrome,
            libelle: c.libelle,
            num: b.x.runner.num,
            nom: b.x.runner.nom,
            type: b.type,
            cote: Number(b.x.runner.cote),
            odds: +b.o.toFixed(2),
            p: +b.p.toFixed(4),
            ev: +b.ev.toFixed(3),
            stakePct: +stakePct.toFixed(4),
            sentAt: new Date().toISOString(),
          };
          const title = `Hoshi Turf · R${reu.r}C${c.c} ${hour(c.heure)} ${reu.hippodrome}`;
          const msg =
            `Jouer ${b.type === 'g' ? 'GAGNANT' : 'PLACÉ'} n°${alert.num} ${alert.nom}. ` +
            `Cote ${fr(alert.cote)}${b.type === 'p' ? ` (placé estimé ${fr(alert.odds)})` : ''}, ` +
            `${Math.round(alert.p * 100)} % de chances, valeur ${fr(alert.ev, 2)}. ` +
            `Mise conseillée : ${fr(stakePct * 100)} % de votre bankroll. Vérifiez la cote avant de jouer.`;
          console.log('ALERTE ' + title + ' — ' + msg);
          await notify('🔔 ' + title, msg, 'rotating_light', { priority: 5, click: link(today, reu.r, c.c) });
          state.sent[key] = alert.sentAt;
          state.alerts.push(alert);
        }
      }
  }
  await selectionAndReminders(state, today, cal, stats, day);
  if (day && !process.env.ALERT_DATE) await freezePronos(day, cal, stats, today, state);

  // On ne garde que les 3 derniers jours.
  const limit = parisDate(-3);
  state.alerts = state.alerts.filter((x) => x.date >= limit);
  for (const k of Object.keys(state.sent)) if (k.slice(0, 10) < limit) delete state.sent[k];
  await writeFile(OUT, JSON.stringify(state));
}
main();
