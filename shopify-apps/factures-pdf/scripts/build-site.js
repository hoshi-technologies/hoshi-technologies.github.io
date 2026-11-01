// Génère le site public de l'appli dans /factures-pdf à la racine du dépôt (GitHub Pages) :
// présentation (fr, en), confidentialité, conditions, guide et FAQ dans les 7 langues.
//
//   npm run site
//
// Informations de l'éditeur : à compléter ci-dessous (ou par variables d'environnement)
// avant publication ; les valeurs entre crochets apparaissent surlignées sur les pages.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, dictionary } from '../src/i18n/index.js';
import { guideContent, faqContent, docVars } from '../src/docs.js';
import { renderGuidePage, renderFaqPage } from '../src/docs-page.js';
import { PLANS, BILLING_CURRENCY } from '../src/plans.js';
import { SITE, PRIVACY, TERMS } from './site-content.js';

const env = process.env;
export const COMPANY = {
  name: env.COMPANY_NAME || 'Hoshi Technologies',
  legal: env.COMPANY_LEGAL || '[forme juridique et capital]',
  address: env.COMPANY_ADDRESS || '[adresse du siège]',
  siren: env.COMPANY_SIREN || '[SIREN]',
  email: env.SUPPORT_EMAIL || '[e-mail de contact]',
  host: env.HOSTING_PROVIDER || '[hébergeur et pays des serveurs]',
  mailer: env.EMAIL_PROVIDER || '[service d’envoi d’e-mails et pays]',
  transfers: env.DATA_TRANSFERS || '',
  court: env.COMPANY_COURT || '[ville du siège]',
  appStoreUrl: env.APP_STORE_URL || 'https://apps.shopify.com/',
  updated: env.LEGAL_DATE || new Date().toISOString().slice(0, 10),
};

const OUT = fileURLToPath(new URL('../../../factures-pdf/', import.meta.url));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Texte échappé avec {variables} ; une valeur « [à compléter] » est surlignée. */
const fill = (text, vars) =>
  esc(text).replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in vars)) return m;
    const v = String(vars[k]);
    return v.startsWith('[') ? `<mark class="todo">${esc(v)}</mark>` : esc(v);
  });

function write(path, content) {
  mkdirSync(fileURLToPath(new URL('.', new URL(path, `file://${OUT}`))), { recursive: true });
  writeFileSync(`${OUT}${path}`, content);
  console.log(`  factures-pdf/${path}`);
}

const PAGES = {
  fr: { home: 'index.html', privacy: 'confidentialite.html', terms: 'conditions.html', other: ['en', 'en.html', 'English'] },
  en: { home: 'en.html', privacy: 'privacy.html', terms: 'terms.html', other: ['fr', 'index.html', 'Français'] },
};
const docLink = (page, code) => `aide/${page}-${code}.html`;

function shell({ lang, title, description, body, active = '' }) {
  const s = SITE[lang];
  const p = PAGES[lang];
  const app = dictionary(lang).admin.appName;
  return `<!doctype html>
<html lang="${s.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="alternate" hreflang="fr" href="${PAGES.fr[active || 'home']}">
<link rel="alternate" hreflang="en" href="${PAGES.en[active || 'home']}">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="${p.home}"><span class="logo">F</span>${esc(app)}</a>
  <nav>
    <a href="${p.home}#features">${esc(s.nav.features)}</a>
    <a href="${p.home}#pricing">${esc(s.nav.pricing)}</a>
    <a href="${docLink('guide', lang)}">${esc(s.nav.guide)}</a>
    <a href="${docLink('faq', lang)}">${esc(s.nav.faq)}</a>
    <a href="${PAGES[p.other[0]][active || 'home']}" hreflang="${p.other[0]}">${p.other[2]}</a>
    <a class="btn small" href="${esc(COMPANY.appStoreUrl)}">${esc(s.nav.install)}</a>
  </nav>
</div></header>
${body}
<footer class="foot"><div class="wrap">
  <span>${esc(s.footer.by)} ${esc(COMPANY.name)}</span>
  <a href="${p.privacy}">${esc(s.footer.privacy)}</a>
  <a href="${p.terms}">${esc(s.footer.terms)}</a>
  <a href="${docLink('guide', lang)}">${esc(s.nav.guide)}</a>
  <a href="${docLink('faq', lang)}">${esc(s.nav.faq)}</a>
  ${COMPANY.email.startsWith('[') ? '' : `<a href="mailto:${esc(COMPANY.email)}">${esc(s.footer.contact)}</a>`}
</div></footer>
</body>
</html>
`;
}

function landing(lang) {
  const s = SITE[lang];
  const vars = docVars(lang, COMPANY.email.startsWith('[') ? '' : COMPANY.email);
  const usd = (n) => new Intl.NumberFormat(dictionary(lang).intl, { style: 'currency', currency: BILLING_CURRENCY }).format(n);
  const faq = faqContent(lang, vars.support);
  const picks = [[0, 0], [0, 1], [2, 0], [4, 0], [1, 0]].map(([a, b]) => faq[a].items[b]);
  const shot = existsSync(`${OUT}img/home-${lang}.png`) ? `<img class="shot" src="img/home-${lang}.png" alt="">` : '';
  const plan = (key, featured) => {
    const [name, limit, extra] = s.plans[key];
    return `<div class="plan${featured ? ' featured' : ''}"><h3>${esc(name)}</h3>
      <p class="price">${esc(usd(PLANS[key].price))} <small>${esc(s.perMonth)}</small></p>
      <p>${fill(limit, vars)}</p><p class="muted">${fill(extra, vars)}</p></div>`;
  };
  const body = `<main>
<section class="hero"><div class="wrap">
  <h1>${esc(s.hero.title)}</h1>
  <p class="lead">${esc(s.hero.text)}</p>
  <p class="ctas"><a class="btn" href="${esc(COMPANY.appStoreUrl)}">${esc(s.hero.cta)}</a>
     <a class="btn ghost" href="${docLink('guide', lang)}">${esc(s.hero.secondary)}</a></p>
  <p class="muted">${fill(s.hero.note, vars)}</p>
  ${shot}
</div></section>
<section><div class="wrap">
  <h2>${esc(s.stepsTitle)}</h2>
  <ol class="steps">${s.steps.map(([t, d]) => `<li><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('')}</ol>
</div></section>
<section id="features" class="alt"><div class="wrap">
  <h2>${esc(s.featuresTitle)}</h2>
  <div class="grid">${s.features.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div>
</div></section>
<section><div class="wrap narrow">
  <h2>${esc(s.reform.title)}</h2>
  <p>${esc(s.reform.text)}</p>
</div></section>
<section id="pricing" class="alt"><div class="wrap">
  <h2>${esc(s.pricingTitle)}</h2>
  <div class="plans">${plan('free')}${plan('essentiel', true)}${plan('illimite')}</div>
  <p class="muted center">${esc(s.pricingNote)}</p>
</div></section>
<section><div class="wrap narrow">
  <h2>${esc(s.faqTitle)}</h2>
  ${picks.map((i) => `<details><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join('')}
  <p><a href="${docLink('faq', lang)}">${esc(s.faqMore)} →</a></p>
</div></section>
</main>`;
  return shell({ lang, title: `${dictionary(lang).admin.appName} – ${s.hero.title}`, description: s.hero.text, body });
}

function legal(lang, doc, key) {
  const vars = {
    app: dictionary(lang).admin.appName,
    company: COMPANY.name,
    legal: COMPANY.legal,
    address: COMPANY.address,
    siren: COMPANY.siren,
    email: COMPANY.email,
    host: COMPANY.host,
    mailer: COMPANY.mailer,
    transfers: COMPANY.transfers,
    court: COMPANY.court,
    date: COMPANY.updated,
    privacyUrl: PAGES[lang].privacy,
    ...docVars(lang),
  };
  const block = (part) =>
    Array.isArray(part)
      ? `<ul>${part.map((li) => `<li>${fill(li, vars)}</li>`).join('')}</ul>`
      : part && fill(part, vars)
        ? `<p>${fill(part, vars)}</p>`
        : '';
  const body = `<main class="wrap narrow legal">
  <h1>${esc(doc.title)}</h1>
  <p class="muted">${fill(doc.updated, vars)}</p>
  ${doc.sections.map(([title, parts], i) => `<h2>${i + 1}. ${esc(title)}</h2>${parts.map(block).join('')}`).join('\n  ')}
</main>`;
  return shell({ lang, title: `${doc.title} – ${vars.app}`, description: doc.title, body, active: key });
}

const STYLE = `:root{--bg:#fff;--alt:#f6f6f7;--text:#1f2328;--muted:#5c6470;--border:#e3e5e8;--accent:#1f2937;--accent-text:#fff;--mark:#fff3bf}
@media (prefers-color-scheme:dark){:root{--bg:#111315;--alt:#181b1f;--text:#e6e8ea;--muted:#a3abb4;--border:#2b3036;--accent:#e6e8ea;--accent-text:#111315;--mark:#5c4a00}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:0 20px}.narrow{max-width:760px}
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:60px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none}
.logo{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--accent);color:var(--accent-text);font-size:16px}
.top nav{display:flex;align-items:center;gap:18px;flex-wrap:wrap;font-size:15px}.top nav a{text-decoration:none;color:var(--muted)}
.btn{display:inline-block;background:var(--accent);color:var(--accent-text)!important;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px}
.btn.small{padding:7px 14px}.btn.ghost{background:transparent;color:var(--text)!important;border:1px solid var(--border)}
section{padding:64px 0}section.alt{background:var(--alt)}
h1{font-size:clamp(32px,5vw,52px);line-height:1.1;margin:0 0 16px;letter-spacing:-.02em}h2{font-size:30px;margin:0 0 24px;letter-spacing:-.01em}h3{font-size:18px;margin:0 0 6px}
.hero{padding-top:72px;text-align:center}.lead{font-size:20px;color:var(--muted);max-width:760px;margin:0 auto 24px}
.ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}.muted{color:var(--muted)}.center{text-align:center}
.shot{display:block;max-width:100%;height:auto;margin:40px auto 0;border-radius:14px;border:1px solid var(--border);box-shadow:0 20px 50px rgba(0,0,0,.12)}
.steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;counter-reset:s}
.steps li{counter-increment:s;padding:20px;border:1px solid var(--border);border-radius:14px}
.steps li::before{content:counter(s);display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--accent-text);font-weight:700;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.card,.plan{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:20px}.card p{margin:0;color:var(--muted)}
.plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:16px}
.plan p{margin:6px 0}.plan.featured{border:2px solid var(--accent)}.price{font-size:30px;font-weight:700}.price small{font-size:15px;font-weight:400;color:var(--muted)}
details{border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--bg)}summary{cursor:pointer;padding:14px 18px;font-weight:600}details p{margin:0;padding:0 18px 16px;color:var(--muted)}
.legal{padding-top:40px;padding-bottom:64px}.legal h2{font-size:21px;margin:32px 0 8px}.legal li{margin-bottom:6px}
mark.todo{background:var(--mark);color:inherit;padding:0 4px;border-radius:4px}
.foot{border-top:1px solid var(--border);padding:28px 0;font-size:15px;color:var(--muted)}.foot .wrap{display:flex;gap:20px;flex-wrap:wrap}
@media (max-width:640px){.top nav a:not(.btn){display:none}section{padding:48px 0}}
`;

console.log('Site généré :');
write('style.css', STYLE);
for (const lang of ['fr', 'en']) {
  write(PAGES[lang].home, landing(lang));
  write(PAGES[lang].privacy, legal(lang, PRIVACY[lang], 'privacy'));
  write(PAGES[lang].terms, legal(lang, TERMS[lang], 'terms'));
}
const support = COMPANY.email.startsWith('[') ? '' : COMPANY.email;
for (const { code } of LANGUAGES) {
  const ctx = {
    lang: code,
    languages: LANGUAGES,
    t: dictionary(code).admin,
    support,
    link: (page, c) => `${page}-${c}.html`,
    home: code === 'fr' ? '../index.html' : '../en.html',
  };
  write(`aide/guide-${code}.html`, renderGuidePage({ ...ctx, guide: guideContent(code, support) }));
  write(`aide/faq-${code}.html`, renderFaqPage({ ...ctx, faq: faqContent(code, support) }));
}
