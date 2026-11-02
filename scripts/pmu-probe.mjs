#!/usr/bin/env node
// Diagnostic : affiche la structure brute de quelques réponses de l'API PMU.
const API = 'https://online.turfinfo.api.pmu.fr/rest/client/1/programme/';
const API7 = 'https://online.turfinfo.api.pmu.fr/rest/client/7/programme/';
const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const ds = iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4);
function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `…${v.length}`] : [];
  if (v && typeof v === 'object') {
    if (depth > 6) return '{…}';
    const o = {};
    for (const k of Object.keys(v)) o[k] = shape(v[k], depth + 1);
    return o;
  }
  return v;
}
async function show(label, url, full) {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const t = await r.text();
    console.log('=====', label, r.status, t.length);
    try {
      const j = JSON.parse(t);
      console.log(JSON.stringify(full ? j : shape(j)).slice(0, full ? 3000 : 4000));
    } catch {
      console.log(t.slice(0, 300));
    }
  } catch (e) {
    console.log('=====', label, 'ERREUR', e.message);
  }
}
// Course de la journée (champs complets de la 1re course)
const prog = await (await fetch(API + ds)).json();
const c0 = prog.programme.reunions[0].courses[0];
console.log('===== champs course', JSON.stringify(c0).slice(0, 3000));
const R = prog.programme.reunions[0].numOfficiel;
const paths = [
  `/R${R}/C1/combinaisons?specialisation=INTERNET`,
  `/R${R}/C1/combinaisons?specialisation=OFFLINE`,
  `/R${R}/C1/rapports-probables`,
  `/R${R}/C1/rapports/SIMPLE_PLACE?specialisation=INTERNET`,
  `/R${R}/C1/rapports/E_SIMPLE_PLACE`,
];
for (const p of paths) await show(p, API + ds + p);
for (const p of paths.slice(0, 2)) await show('v7 ' + p, API7 + ds + p);
