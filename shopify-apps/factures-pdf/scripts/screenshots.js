// Captures d'écran pour la fiche App Store (1600 × 900) et le site, à partir du mode démo.
//
//   npm run screenshots          (nécessite Playwright : npm i -D playwright && npx playwright install chromium)
//
// Résultat : docs/app-store/<langue>/*.png et, si le site est présent, <site>/img/home-<langue>.png
// (site : ../hoshi-technologies.github.io/factures-pdf, ou SITE_DIR).

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_IMG = process.env.SITE_DIR
  ? `${process.env.SITE_DIR.replace(/[\\/]+$/, '')}/img/`
  : fileURLToPath(new URL('../../hoshi-technologies.github.io/factures-pdf/img/', import.meta.url));
const CAPTIONS = {
  fr: { invoice: 'Une facture claire, conforme et au format Factur-X' },
  en: { invoice: 'A clear, compliant invoice, in Factur-X format' },
};

function startDemo(lang, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/demo.js', lang], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), DEMO_COMPLETE: '1' },
    });
    child.stdout.on('data', (d) => d.toString().includes('localhost') && resolve(child));
    child.on('error', reject);
    setTimeout(() => reject(new Error('Le mode démo ne démarre pas')), 15000);
  });
}

async function shoot(lang, port) {
  const out = join(ROOT, 'docs', 'app-store', lang);
  mkdirSync(out, { recursive: true });
  mkdirSync(SITE_IMG, { recursive: true });
  const base = `http://localhost:${port}`;
  const token = await (await fetch(`${base}/demo/token`)).text();
  const api = (path, init = {}) => fetch(`${base}/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  // Quelques commandes de plus, pour des écrans « réels » (entreprise déjà complète : DEMO_COMPLETE).
  for (let i = 0; i < 4; i++) await fetch(`${base}/demo/order`, { method: 'POST' });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('previewed', '1');
    localStorage.setItem('tab', 'home');
  });
  await page.goto(base);
  await page.waitForSelector('#invoices tr td b');
  await page.addStyleTag({ content: 'body > div:first-child { display:none !important }' }); // sans le bandeau démo
  const snap = async (name) => page.screenshot({ path: join(out, name) });

  await snap('1-accueil.png');
  // Pour le site : la même vue, recadrée sur le contenu.
  const box = await page.locator('main').boundingBox();
  await page.screenshot({ path: join(SITE_IMG, `home-${lang}.png`), clip: { x: box.x - 24, y: 0, width: box.width + 48, height: box.y + box.height + 24 } });
  await page.click('[data-tab="settings"]');
  await snap('2-reglages.png');
  await page.click('[data-tab="billing"]');
  await snap('4-abonnement.png');
  await page.click('[data-tab="help"]');
  await snap('5-aide.png');

  // Facture : rendu du PDF (pdftoppm) présenté sur un fond, avec une légende.
  const { invoices } = await (await api('/invoices')).json();
  const tmp = mkdtempSync(join(tmpdir(), 'facture-'));
  writeFileSync(join(tmp, 'f.pdf'), Buffer.from(await (await api(`/invoices/${(invoices.find((i) => i.language === lang) ?? invoices[0]).id}/pdf`)).arrayBuffer()));
  execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', join(tmp, 'f.pdf'), join(tmp, 'f')]);
  const img = readFileSync(join(tmp, 'f.png')).toString('base64');
  await page.setContent(`<body style="margin:0;height:900px;display:flex;align-items:center;justify-content:center;gap:60px;background:linear-gradient(135deg,#eef2f7,#dfe6ee);font:600 40px -apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937">
    <div style="width:520px;line-height:1.25">${CAPTIONS[lang].invoice}</div>
    <img src="data:image/png;base64,${img}" style="height:840px;box-shadow:0 20px 50px rgba(0,0,0,.18);border-radius:6px"></body>`);
  await snap('3-facture.png');
  await browser.close();
  console.log(`  ${lang} : docs/app-store/${lang}/ (5 captures)`);
}

let port = 3700;
for (const lang of ['fr', 'en']) {
  const demo = await startDemo(lang, ++port);
  try {
    await shoot(lang, port);
  } finally {
    demo.kill();
  }
}
