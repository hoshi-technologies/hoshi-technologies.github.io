/* Hoshi Fidélité – widget boutique (sans dépendance) */
(function () {
  if (window.__hoshiLoyalty) return;
  window.__hoshiLoyalty = true;

  var cache = null;
  var listeners = [];

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    try { return new Intl.NumberFormat(document.documentElement.lang || "fr-FR").format(n); }
    catch (e) { return String(n); }
  }

  function load(endpoint, force) {
    if (cache && !force) return cache;
    cache = fetch(endpoint, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); });
    return cache;
  }
  function update(state) {
    cache = Promise.resolve(state);
    listeners.forEach(function (fn) { fn(state); });
  }

  function redeem(endpoint, rewardId) {
    return fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ rewardId: rewardId }),
    }).then(function (r) { return r.json(); });
  }

  /* -------------------- Rendu commun -------------------- */

  function renderBody(state, opts) {
    var p = esc(state.pointsName);
    if (!state.enabled) {
      return '<div class="hl-empty">Le programme de fidélité est momentanément indisponible.</div>';
    }

    var ways =
      '<div class="hl-section"><div class="hl-section-title">Comment gagner des ' + p + '</div>' +
      '<div class="hl-way"><span>🛍️</span><div><strong>' + fmt(state.pointsPerUnit) + " " + p +
      '</strong> par euro dépensé</div></div>' +
      (state.signupPoints > 0
        ? '<div class="hl-way"><span>🎉</span><div><strong>' + fmt(state.signupPoints) + " " + p +
          "</strong> offerts à l'inscription</div></div>"
        : "") +
      "</div>";

    if (!state.member) {
      return (
        '<div class="hl-guest"><p>' + esc(opts.guestText) + "</p>" +
        '<a class="hl-btn hl-btn-primary" href="' + esc(opts.registerUrl) + '">Rejoindre le programme</a>' +
        '<a class="hl-link" href="' + esc(opts.loginUrl) + '">J\'ai déjà un compte</a></div>' +
        ways + rewardsList(state, null)
      );
    }

    var m = state.member;
    var codes = m.codes.length
      ? '<div class="hl-section"><div class="hl-section-title">Mes codes</div>' +
        m.codes.map(function (c) {
          return '<div class="hl-code"><div><div class="hl-reward-title">' + esc(c.title) +
            '</div><code>' + esc(c.code) + '</code></div><a class="hl-btn hl-btn-small" href="/discount/' +
            encodeURIComponent(c.code) + '?redirect=/cart">Utiliser</a></div>';
        }).join("") + "</div>"
      : "";

    var perks = m.tier && m.tier.perks && m.tier.perks.length
      ? '<div class="hl-section"><div class="hl-section-title">Mes avantages ' + esc(m.tier.name) + "</div>" +
        m.tier.perks.map(function (perk) {
          return '<div class="hl-way"><span>✨</span><div>' + esc(perk) + "</div></div>";
        }).join("") + "</div>"
      : "";

    return perks + rewardsList(state, m) + codes + ways;
  }

  function rewardsList(state, member) {
    if (!state.rewards.length) return "";
    var p = esc(state.pointsName);
    return (
      '<div class="hl-section"><div class="hl-section-title">Récompenses</div>' +
      state.rewards.map(function (r) {
        var can = member && member.points >= r.pointsCost;
        var missing = member ? r.pointsCost - member.points : 0;
        return (
          '<div class="hl-reward"><div><div class="hl-reward-title">' + esc(r.title) + "</div>" +
          '<div class="hl-reward-cost">' + fmt(r.pointsCost) + " " + p +
          (r.minSubtotal ? " · dès " + esc(r.minSubtotal) + " €" : "") + "</div></div>" +
          (member
            ? '<button type="button" class="hl-btn hl-btn-small' + (can ? " hl-btn-primary" : "") +
              '" data-reward="' + esc(r.id) + '"' + (can ? "" : " disabled") + ">" +
              (can ? "Obtenir" : "Encore " + fmt(missing)) + "</button>"
            : "") +
          "</div>"
        );
      }).join("") + "</div>"
    );
  }

  function header(state, firstName) {
    var m = state.member;
    if (!m) {
      return '<div class="hl-header-label">' + esc(state.title) + "</div>" +
        '<div class="hl-header-big">Gagnez des ' + esc(state.pointsName) + "</div>";
    }
    var name = m.firstName || firstName;
    return (
      '<div class="hl-header-label">' + (name ? "Bonjour " + esc(name) + " 👋" : esc(state.title)) + "</div>" +
      '<div class="hl-header-big">' + fmt(m.points) + ' <small>' + esc(state.pointsName) + "</small></div>" +
      (m.tier ? '<div class="hl-tier">★ ' + esc(m.tier.name) + (m.tier.multiplier > 1 ? " · ×" + esc(m.tier.multiplier) : "") + "</div>" : "") +
      (m.nextTier ? '<div class="hl-next">Encore ' + fmt(m.nextTier.missing) + " " + esc(state.pointsName) +
        " pour " + esc(m.nextTier.name) + "</div>" : "")
    );
  }

  function bindRedeem(root, endpoint) {
    root.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-reward]");
      if (!btn || btn.disabled) return;
      var title = btn.closest(".hl-reward").querySelector(".hl-reward-title").textContent;
      if (!window.confirm("Échanger vos points contre « " + title + " » ?")) return;
      btn.disabled = true;
      btn.textContent = "…";
      redeem(endpoint, btn.getAttribute("data-reward")).then(function (res) {
        if (res.error) { toast(res.error, true); btn.disabled = false; btn.textContent = "Obtenir"; return; }
        update(res.state);
        showCode(res.code, res.title);
      }).catch(function () {
        toast("Une erreur est survenue, réessayez.", true);
        btn.disabled = false;
        btn.textContent = "Obtenir";
      });
    });
  }

  function toast(msg, isError) {
    var t = document.createElement("div");
    t.className = "hl-toast" + (isError ? " hl-toast-error" : "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("hl-toast-hide"); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }

  function showCode(code, title) {
    var overlay = document.createElement("div");
    overlay.className = "hl-modal";
    overlay.innerHTML =
      '<div class="hl-modal-box" role="dialog" aria-modal="true">' +
      '<div class="hl-modal-emoji">🎁</div><div class="hl-modal-title">Félicitations !</div>' +
      "<p>Votre récompense « " + esc(title) + " » est prête :</p>" +
      '<button type="button" class="hl-modal-code" title="Copier">' + esc(code) + "</button>" +
      '<a class="hl-btn hl-btn-primary" href="/discount/' + encodeURIComponent(code) + '?redirect=/cart">Appliquer à mon panier</a>' +
      '<button type="button" class="hl-link" data-close>Fermer</button></div>';
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.hasAttribute("data-close")) overlay.remove();
      if (e.target.classList.contains("hl-modal-code") && navigator.clipboard) {
        navigator.clipboard.writeText(code).then(function () { toast("Code copié"); });
      }
    });
    document.body.appendChild(overlay);
  }

  /* -------------------- Widget flottant -------------------- */

  function initWidget(el) {
    var endpoint = el.dataset.endpoint;
    var opts = {
      guestText: el.dataset.guestText,
      loginUrl: el.dataset.loginUrl,
      registerUrl: el.dataset.registerUrl,
    };

    el.innerHTML =
      '<button type="button" class="hl-launcher" aria-expanded="false" aria-controls="hl-panel">' +
      '<span class="hl-star">★</span><span class="hl-launcher-label"></span></button>' +
      '<div class="hl-panel" id="hl-panel" hidden>' +
      '<div class="hl-header"><button type="button" class="hl-close" aria-label="Fermer">×</button><div class="hl-header-content"></div></div>' +
      '<div class="hl-body"><div class="hl-loading">Chargement…</div></div></div>';

    var launcher = el.querySelector(".hl-launcher");
    var panel = el.querySelector(".hl-panel");

    function render(state) {
      if (state.error) return;
      el.style.setProperty("--hl-color", state.color || "#5C6AC4");
      var pos = el.dataset.position === "app" ? state.position || "right" : el.dataset.position;
      el.classList.toggle("hl-left", pos === "left");
      var label = el.dataset.label || state.title;
      if (state.member) label += " · " + fmt(state.member.points);
      el.querySelector(".hl-launcher-label").textContent = label;
      el.querySelector(".hl-header-content").innerHTML = header(state, el.dataset.firstName);
      el.querySelector(".hl-body").innerHTML = renderBody(state, opts);
      el.classList.add("hl-ready");
    }

    function toggle(open) {
      panel.hidden = !open;
      launcher.setAttribute("aria-expanded", String(open));
      el.classList.toggle("hl-open", open);
    }

    launcher.addEventListener("click", function () { toggle(panel.hidden); });
    el.querySelector(".hl-close").addEventListener("click", function () { toggle(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });
    bindRedeem(el, endpoint);
    listeners.push(render);

    load(endpoint).then(function (state) {
      if (!state || state.error || !state.enabled) { el.remove(); return; }
      render(state);
    }).catch(function () { el.remove(); });
  }

  /* -------------------- Carte dans une page -------------------- */

  function initCard(el) {
    var endpoint = el.dataset.endpoint;
    var opts = {
      guestText: "Créez un compte pour gagner des points à chaque achat.",
      loginUrl: el.dataset.loginUrl,
      registerUrl: el.dataset.registerUrl,
    };
    el.innerHTML = '<div class="hl-loading">Chargement…</div>';
    function render(state) {
      if (state.error) { el.innerHTML = ""; return; }
      el.style.setProperty("--hl-color", state.color || "#5C6AC4");
      el.innerHTML =
        '<div class="hl-card"><div class="hl-header">' +
        (el.dataset.heading ? '<div class="hl-card-heading">' + esc(el.dataset.heading) + "</div>" : "") +
        header(state, "") + '</div><div class="hl-body">' + renderBody(state, opts) + "</div></div>";
    }
    bindRedeem(el, endpoint);
    listeners.push(render);
    load(endpoint).then(render).catch(function () { el.innerHTML = ""; });
  }

  function init() {
    var widget = document.getElementById("hoshi-loyalty");
    if (widget) initWidget(widget);
    document.querySelectorAll("[data-hoshi-card]").forEach(initCard);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
