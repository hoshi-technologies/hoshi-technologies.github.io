#!/usr/bin/env node
/*
 * Alertes Hoshi Turf : après chaque mise à jour des cotes, cherche dans les courses qui
 * partent bientôt un pari qui correspond à une stratégie VALIDÉE par la simulation
 * (rentable sur les courses passées même après retrait de la marge de hasard).
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

async function notify(title, message, tags = 'horse_racing') {
  if (!TOPIC) {
    console.log('  (NTFY_TOPIC absent : notification non envoyée)\n  ' + title + ' — ' + message);
    return false;
  }
  const res = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: TOPIC, title, message, tags: tags.split(','), priority: 4, click: PAGE }),
  });
  console.log('  notification envoyée : ' + res.status);
  return res.ok;
}

// Mêmes compléments que la page : taux jockey/entraîneur tirés des statistiques archivées.
function enrich(partants, stats, dateIso) {
  return partants.map((p) => {
    const r = Object.assign({}, p);
    const j = Turf.statRate(stats && stats.jockeys && stats.jockeys[p.jockeyNom]);
    const e = Turf.statRate(stats && stats.entraineurs && stats.entraineurs[p.entraineurNom]);
    if (j != null) r.jockey = j;
    if (e != null) r.entraineur = e;
    if (r.repos == null && stats && stats.chevaux && stats.chevaux[p.nom] && stats.chevaux[p.nom] < dateIso)
      r.repos = Math.round((new Date(dateIso + 'T12:00:00Z') - new Date(stats.chevaux[p.nom] + 'T12:00:00Z')) / 86400000);
    return r;
  });
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
        const settings = Turf.settingsFor(cal, c.discipline);
        const a = Turf.analyzeRace(
          { discipline: c.discipline, allocation: c.allocation, runners: enrich(c.partants, stats, today) },
          Object.assign({}, settings || {}, { simulations: 0 }),
        );
        const bets = Turf.valueBets(a, cal, { minEdge: strat.threshold, types: strat.type });
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
          await notify(title, msg);
          state.sent[key] = alert.sentAt;
          state.alerts.push(alert);
        }
      }
  }
  // On ne garde que les 3 derniers jours.
  const limit = parisDate(-3);
  state.alerts = state.alerts.filter((x) => x.date >= limit);
  for (const k of Object.keys(state.sent)) if (k.slice(0, 10) < limit) delete state.sent[k];
  await writeFile(OUT, JSON.stringify(state));
}
main();
