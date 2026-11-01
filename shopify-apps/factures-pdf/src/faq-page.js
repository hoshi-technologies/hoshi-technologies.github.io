// Page publique de la FAQ (à indiquer dans la fiche App Store), dans les 7 langues.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderFaqPage({ lang, faq, languages, t, support }) {
  const sections = faq
    .map(
      (section) => `<section><h2>${esc(section.title)}</h2>${section.items
        .map((item) => `<details><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`)
        .join('')}</section>`,
    )
    .join('');
  const switcher = languages
    .map((l) => (l.code === lang ? `<strong>${esc(l.name)}</strong>` : `<a href="?lang=${esc(l.code)}" hreflang="${esc(l.code)}">${esc(l.name)}</a>`))
    .join(' · ');
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.appName)} – ${esc(t['help.title'])}</title>
<style>
  :root { --bg:#f6f6f7; --card:#fff; --text:#202223; --muted:#6d7175; --border:#e1e3e5; --accent:#1f2937; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111213; --card:#1c1d1f; --text:#e3e5e7; --muted:#a6acb2; --border:#2e3033; --accent:#e3e5e7; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  main { max-width:760px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:28px; margin:0 0 4px; }
  .langs { color:var(--muted); font-size:14px; margin-bottom:20px; }
  .langs a { color:inherit; }
  input { width:100%; padding:12px 14px; font:inherit; border:1px solid var(--border); border-radius:10px; background:var(--card); color:var(--text); margin-bottom:20px; }
  h2 { font-size:17px; margin:28px 0 8px; }
  details { background:var(--card); border:1px solid var(--border); border-radius:10px; margin-bottom:8px; }
  summary { cursor:pointer; padding:12px 16px; font-weight:600; }
  details p { margin:0; padding:0 16px 14px; color:var(--text); }
  .empty, footer { color:var(--muted); }
  footer { margin-top:32px; font-size:14px; }
</style>
</head>
<body>
<main>
  <h1>${esc(t.appName)} – ${esc(t['help.title'])}</h1>
  <div class="langs">${switcher}</div>
  <input type="search" id="q" placeholder="${esc(t['help.search'])}" aria-label="${esc(t['help.search'])}">
  <div id="faq">${sections}</div>
  <p class="empty" id="empty" hidden>${esc(t['help.noResult'])}</p>
  ${support ? `<footer>${esc(t['help.contact']).replace('{support}', `<a href="mailto:${esc(support)}">${esc(support)}</a>`)}</footer>` : ''}
</main>
<script>
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
    for (const s of document.querySelectorAll('section')) s.hidden = !s.querySelector('details:not([hidden])');
    document.getElementById('empty').hidden = shown > 0;
  });
</script>
</body>
</html>`;
}
