#!/usr/bin/env node
// Diagnostic : historiques avec cotes (football-data.co.uk, tennis-data.co.uk).
const urls = [
  'https://www.football-data.co.uk/mmz4281/2526/F1.csv',
  'https://www.football-data.co.uk/mmz4281/2627/F1.csv',
  'https://www.football-data.co.uk/mmz4281/2425/E0.csv',
  'https://www.football-data.co.uk/mmz4281/1920/SP1.csv',
  'http://www.tennis-data.co.uk/2025/2025.xlsx',
  'http://www.tennis-data.co.uk/2025w/2025.xlsx',
];
for (const u of urls) {
  try {
    const r = await fetch(u);
    const buf = Buffer.from(await r.arrayBuffer());
    console.log('=====', u, 'HTTP', r.status, buf.length, 'octets', r.headers.get('content-type'));
    if (u.endsWith('.csv')) {
      const t = buf.toString('latin1').split(/\r?\n/);
      console.log('  en-tête :', t[0].slice(0, 700));
      console.log('  ligne 1 :', (t[1] || '').slice(0, 400));
      console.log('  lignes :', t.length);
    } else console.log('  début :', buf.slice(0, 4).toString('hex'));
  } catch (e) {
    console.log('=====', u, 'ERREUR', e.message);
  }
}
