#!/usr/bin/env node
// Diagnostic : disponibilité et structure des données sportives (API publique ESPN).
const B = 'https://site.api.espn.com/apis/site/v2/sports/';
const leagues = [
  'soccer/fra.1', 'soccer/eng.1', 'soccer/uefa.champions', 'basketball/nba', 'tennis/atp', 'tennis/wta',
  'rugby/270557', 'rugby/164205', 'handball/ehf.champions',
];
function shape(v, d = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1), `…${v.length}`] : [];
  if (v && typeof v === 'object') {
    if (d > 7) return '{…}';
    const o = {};
    for (const k of Object.keys(v).slice(0, 40)) o[k] = shape(v[k], d + 1);
    return o;
  }
  return typeof v === 'string' ? v.slice(0, 40) : v;
}
for (const l of leagues) {
  for (const q of ['', '?dates=20261101']) {
    try {
      const r = await fetch(B + l + '/scoreboard' + q);
      const t = await r.text();
      let j = null;
      try {
        j = JSON.parse(t);
      } catch {}
      const ev = (j && j.events) || [];
      console.log(`===== ${l}${q} : HTTP ${r.status}, ${ev.length} événements, ${t.length} octets`);
      if (ev[0]) {
        const e = ev[0];
        const comp = (e.competitions || [])[0] || {};
        console.log('  1er :', e.name || e.shortName, e.date, (e.status && e.status.type && e.status.type.name) || '');
        console.log('  cotes :', JSON.stringify(comp.odds || null).slice(0, 600));
        console.log('  structure :', JSON.stringify(shape(e)).slice(0, 2500));
      } else if (j) console.log('  clés :', Object.keys(j).join(','), JSON.stringify(shape(j)).slice(0, 1500));
    } catch (e) {
      console.log(`===== ${l}${q} : ERREUR ${e.message}`);
    }
  }
}
