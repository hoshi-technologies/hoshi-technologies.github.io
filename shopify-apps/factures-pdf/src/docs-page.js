// Pages publiques de documentation : guide utilisateur (/guide) et FAQ (/faq), en 7 langues.
// Liens à indiquer dans la fiche App Store ; le guide s'imprime proprement (ou en PDF).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function languageSwitcher(lang, languages) {
  return languages
    .map((l) => (l.code === lang ? `<strong>${esc(l.name)}</strong>` : `<a href="?lang=${esc(l.code)}" hreflang="${esc(l.code)}">${esc(l.name)}</a>`))
    .join(' · ');
}

function layout({ lang, page, title, t, support, body, script = '' }) {
  const nav = [
    ['guide', t['guide.title']],
    ['faq', t['help.title']],
  ]
    .map(([p, label]) => (p === page ? `<span aria-current="page">${esc(label)}</span>` : `<a href="/${p}?lang=${esc(lang)}">${esc(label)}</a>`))
    .join('');
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.appName)} – ${esc(title)}</title>
<style>
  :root { --bg:#f6f6f7; --card:#fff; --text:#202223; --muted:#6d7175; --border:#e1e3e5; --accent:#1f2937; --tip:#eaf4ff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111213; --card:#1c1d1f; --text:#e3e5e7; --muted:#a6acb2; --border:#2e3033; --accent:#e3e5e7; --tip:#16283d; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  main { max-width:780px; margin:0 auto; padding:24px 16px 64px; }
  .bar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:20px; }
  .brand { font-weight:700; }
  nav.docs { display:flex; gap:4px; background:var(--border); padding:3px; border-radius:10px; }
  nav.docs a, nav.docs span { padding:5px 12px; border-radius:8px; color:var(--muted); text-decoration:none; font-size:14px; }
  nav.docs span { background:var(--card); color:var(--text); font-weight:600; }
  h1 { font-size:30px; line-height:1.2; margin:0 0 6px; }
  .lead { color:var(--muted); margin:0 0 6px; }
  .langs { color:var(--muted); font-size:14px; margin-bottom:20px; }
  .langs a { color:inherit; }
  input { width:100%; padding:12px 14px; font:inherit; border:1px solid var(--border); border-radius:10px; background:var(--card); color:var(--text); margin-bottom:20px; }
  h2 { font-size:19px; margin:28px 0 8px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:18px 20px; margin-bottom:14px; }
  .card h2 { margin-top:0; display:flex; gap:10px; align-items:baseline; }
  .num { flex:none; width:28px; height:28px; border-radius:50%; background:var(--accent); color:var(--card); display:inline-grid; place-items:center; font-size:14px; }
  ol.steps { padding-left:22px; margin:10px 0 0; } ol.steps li { margin-bottom:6px; }
  .tip { background:var(--tip); border-radius:10px; padding:10px 14px; margin-top:12px; font-size:15px; }
  .toc { columns:2; column-gap:24px; padding-left:20px; margin:0; } .toc li { break-inside:avoid; } .toc a { color:inherit; }
  @media (max-width:560px) { .toc { columns:1; } }
  details { background:var(--card); border:1px solid var(--border); border-radius:10px; margin-bottom:8px; }
  summary { cursor:pointer; padding:12px 16px; font-weight:600; }
  details p { margin:0; padding:0 16px 14px; }
  button.print { font:inherit; font-weight:600; border:1px solid var(--border); background:var(--card); color:var(--text); border-radius:8px; padding:7px 14px; cursor:pointer; }
  .empty, footer { color:var(--muted); }
  footer { margin-top:32px; font-size:14px; }
  @media print {
    :root { --bg:#fff; --card:#fff; --text:#000; --muted:#444; --border:#ccc; --accent:#000; --tip:#f2f2f2; }
    .bar, .langs, button.print, input { display:none !important; }
    .card { break-inside:avoid; }
    details { break-inside:avoid; } details > p { display:block; }
  }
</style>
</head>
<body>
<main>
  <div class="bar"><span class="brand">${esc(t.appName)}</span><nav class="docs">${nav}</nav></div>
  ${body}
  ${support ? `<footer>${esc(t['help.contact']).replace('{support}', `<a href="mailto:${esc(support)}">${esc(support)}</a>`)}</footer>` : ''}
</main>
${script}
</body>
</html>`;
}

export function renderGuidePage({ lang, guide, languages, t, support }) {
  const toc = guide.map((c) => `<li><a href="#${esc(c.id)}">${esc(c.title)}</a></li>`).join('');
  const chapters = guide
    .map(
      (c, i) => `<section class="card" id="${esc(c.id)}">
  <h2><span class="num">${i + 1}</span><span>${esc(c.title)}</span></h2>
  <p>${esc(c.intro)}</p>
  <ol class="steps">${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  ${c.tips.map((tip) => `<div class="tip"><b>${esc(t['guide.tip'])}${lang === 'fr' ? ' :' : ':'}</b> ${esc(tip)}</div>`).join('')}
</section>`,
    )
    .join('\n');
  const body = `<h1>${esc(t['guide.title'])}</h1>
  <p class="lead">${esc(t['guide.intro'])}</p>
  <div class="langs">${languageSwitcher(lang, languages)}</div>
  <p><button type="button" class="print" onclick="print()">${esc(t['guide.print'])}</button></p>
  <section class="card"><h2>${esc(t['guide.contents'])}</h2><ol class="toc">${toc}</ol></section>
  ${chapters}`;
  return layout({ lang, page: 'guide', title: t['guide.title'], t, support, body });
}

export function renderFaqPage({ lang, faq, languages, t, support }) {
  const sections = faq
    .map(
      (section) => `<section><h2>${esc(section.title)}</h2>${section.items
        .map((item) => `<details><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`)
        .join('')}</section>`,
    )
    .join('');
  const body = `<h1>${esc(t['help.title'])}</h1>
  <div class="langs">${languageSwitcher(lang, languages)}</div>
  <input type="search" id="q" placeholder="${esc(t['help.search'])}" aria-label="${esc(t['help.search'])}">
  <div id="faq">${sections}</div>
  <p class="empty" id="empty" hidden>${esc(t['help.noResult'])}</p>`;
  const script = `<script>
  const q = document.getElementById('q');
  const norm = (s) => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  q.addEventListener('input', () => {
    const words = norm(q.value).split(/\\s+/).filter(Boolean);
    let shown = 0;
    for (const d of document.querySelectorAll('details')) {
      const hit = words.every((w) => norm(d.textContent).includes(w));
      d.hidden = !hit;
      d.open = hit && words.length > 0;
      shown += hit;
    }
    for (const s of document.querySelectorAll('#faq section')) s.hidden = !s.querySelector('details:not([hidden])');
    document.getElementById('empty').hidden = shown > 0;
  });
</script>`;
  return layout({ lang, page: 'faq', title: t['help.title'], t, support, body, script });
}
