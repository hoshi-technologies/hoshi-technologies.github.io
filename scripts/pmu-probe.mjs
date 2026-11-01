#!/usr/bin/env node
// Affiche la structure brute de quelques réponses de l'API PMU (diagnostic).
const API = 'https://online.turfinfo.api.pmu.fr/rest/client/1/programme/';
const d = new Date(Date.now() - 86400000);
const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
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
for (const path of ['/R1/C1/rapports-definitifs', '/R1/C1/performances-detaillees/pretty', '/R1/C1/participants', '/R1/C2/rapports-definitifs']) {
  const url = API + ds + path;
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const t = await r.text();
    console.log('=====', path, r.status, t.length);
    try {
      console.log(JSON.stringify(shape(JSON.parse(t))).slice(0, 6000));
    } catch {
      console.log(t.slice(0, 500));
    }
  } catch (e) {
    console.log('=====', path, 'ERREUR', e.message);
  }
}
