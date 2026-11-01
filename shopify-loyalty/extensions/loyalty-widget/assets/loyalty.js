/* Hoshi Fidélité – widget boutique (sans dépendance) */
(function () {
  if (window.__hoshiLoyalty) return;
  window.__hoshiLoyalty = true;

  var ENDPOINT = "/apps/fidelite/loyalty";
  var MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var SOCIAL_ICONS = { instagram: "📸", facebook: "👍", tiktok: "🎵" };
  var cache = null;
  var listeners = [];
  var widgetOpts = { guestText: "", loginUrl: "/account/login", registerUrl: "/account/register" };

  /* -------------------- Utilitaires -------------------- */

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    try { return new Intl.NumberFormat(document.documentElement.lang || "fr-FR").format(n); }
    catch (e) { return String(n); }
  }
  function fmtDate(d) {
    try { return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return ""; }
  }
  function storage(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  function load(force) {
    if (cache && !force) return cache;
    cache = fetch(ENDPOINT, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); });
    return cache;
  }
  function update(state) {
    cache = Promise.resolve(state);
    listeners.forEach(function (fn) { fn(state); });
  }
  function post(body) {
    return fetch(ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function toast(msg, isError) {
    var t = document.createElement("div");
    t.className = "hl-toast" + (isError ? " hl-toast-error" : "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("hl-toast-hide"); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }

  function modal(html, color) {
    var overlay = document.createElement("div");
    overlay.className = "hl-modal";
    if (color) overlay.style.setProperty("--hl-color", color);
    overlay.innerHTML = '<div class="hl-modal-box" role="dialog" aria-modal="true">' + html + "</div>";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || (e.target.hasAttribute && e.target.hasAttribute("data-close"))) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function codeBlock(code) {
    return '<button type="button" class="hl-modal-code" data-copy="' + esc(code) + '" title="Copier">' + esc(code) + "</button>" +
      '<a class="hl-btn hl-btn-primary" href="/discount/' + encodeURIComponent(code) + '?redirect=/cart">Appliquer à mon panier</a>';
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-copy]");
    if (!el) return;
    var text = el.getAttribute("data-copy");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("Copié !"); });
  });

  /* -------------------- Contenu du panneau -------------------- */

  function section(title, content) {
    return content ? '<div class="hl-section"><div class="hl-section-title">' + esc(title) + "</div>" + content + "</div>" : "";
  }
  function row(icon, html, action) {
    return '<div class="hl-way"><span class="hl-way-icon">' + icon + '</span><div class="hl-way-text">' + html + "</div>" + (action || "") + "</div>";
  }

  function bonusBanner(state) {
    if (!state.bonus) return "";
    return '<div class="hl-bonus">🔥 <strong>' + esc(state.bonus.label || "Points ×" + state.bonus.multiplier) + "</strong>" +
      (state.bonus.endsAt ? " jusqu'au " + esc(fmtDate(state.bonus.endsAt)) : "") + "</div>";
  }

  function rewardsList(state, member) {
    if (!state.rewards.length) return "";
    var p = esc(state.pointsName);
    return section("Récompenses", state.rewards.map(function (r) {
      var can = member && member.points >= r.pointsCost;
      var missing = member ? r.pointsCost - member.points : 0;
      return '<div class="hl-reward"><div><div class="hl-reward-title">' + esc(r.title) + "</div>" +
        '<div class="hl-reward-cost">' + fmt(r.pointsCost) + " " + p + (r.minSubtotal ? " · dès " + esc(r.minSubtotal) + " €" : "") + "</div></div>" +
        (member
          ? '<button type="button" class="hl-btn hl-btn-small' + (can ? " hl-btn-primary" : "") + '" data-reward="' + esc(r.id) + '"' +
            (can ? "" : " disabled") + ">" + (can ? "Obtenir" : "Encore " + fmt(missing)) + "</button>"
          : "") + "</div>";
    }).join(""));
  }

  function earnList(state, member) {
    var p = esc(state.pointsName);
    var mult = member ? member.multiplier : (state.bonus ? state.bonus.multiplier : 1);
    var html = row("🛍️", "<strong>" + fmt(Math.round(state.pointsPerUnit * mult * 100) / 100) + " " + p + "</strong> par euro dépensé");
    if (!member && state.signupPoints > 0) html += row("🎉", "<strong>" + fmt(state.signupPoints) + " " + p + "</strong> à l'inscription");
    if (state.firstOrderPoints > 0 && (!member || member.lifetimePoints <= state.signupPoints)) {
      html += row("🥇", "<strong>" + fmt(state.firstOrderPoints) + " " + p + "</strong> pour votre 1re commande");
    }

    state.social.forEach(function (s) {
      var done = member && member.socialDone.indexOf(s.network) !== -1;
      html += row(SOCIAL_ICONS[s.network] || "⭐", "Suivez-nous sur " + esc(s.label) + " <strong>+" + fmt(state.socialPoints) + "</strong>",
        member
          ? done
            ? '<span class="hl-done">✓</span>'
            : '<button type="button" class="hl-btn hl-btn-small hl-btn-primary" data-social="' + esc(s.network) + '" data-url="' + esc(s.url) + '">Suivre</button>'
          : "");
    });

    if (state.birthdayPoints > 0) {
      if (!member) {
        html += row("🎂", "<strong>" + fmt(state.birthdayPoints) + " " + p + "</strong> pour votre anniversaire");
      } else if (member.birthday) {
        var parts = member.birthday.split("-");
        html += row("🎂", "Anniversaire le <strong>" + Number(parts[1]) + " " + MONTHS[Number(parts[0]) - 1] + "</strong> : " + fmt(state.birthdayPoints) + " " + p + " offerts");
      } else {
        var days = "", months = "";
        for (var d = 1; d <= 31; d++) days += '<option value="' + d + '">' + d + "</option>";
        MONTHS.forEach(function (m, i) { months += '<option value="' + (i + 1) + '">' + m + "</option>"; });
        html += '<div class="hl-way hl-birthday"><span class="hl-way-icon">🎂</span><div class="hl-way-text">' +
          "Votre anniversaire : <strong>+" + fmt(state.birthdayPoints) + "</strong>" +
          '<div class="hl-birthday-form"><select data-bday-day aria-label="Jour">' + days + "</select>" +
          '<select data-bday-month aria-label="Mois">' + months + "</select>" +
          '<button type="button" class="hl-btn hl-btn-small hl-btn-primary" data-birthday>OK</button></div></div></div>';
      }
    }
    return section("Gagner des " + state.pointsName, html);
  }

  function referralBlock(state, member) {
    if (!state.referral) return "";
    var p = esc(state.pointsName);
    var intro = "Offrez <strong>" + esc(state.referral.friendReward) + "</strong> à vos amis et gagnez <strong>" +
      fmt(state.referral.referrerPoints) + " " + p + "</strong> à leur première commande.";
    if (!member || !member.referralCode) return section("Parrainage", '<div class="hl-referral"><p>' + intro + "</p></div>");
    var link = location.origin + "/?parrain=" + encodeURIComponent(member.referralCode);
    return section("Parrainez vos amis",
      '<div class="hl-referral"><p>' + intro + "</p>" +
      '<div class="hl-referral-link"><input readonly value="' + esc(link) + '" aria-label="Lien de parrainage">' +
      '<button type="button" class="hl-btn hl-btn-small hl-btn-primary" data-copy="' + esc(link) + '">Copier</button></div>' +
      (navigator.share ? '<button type="button" class="hl-link" data-share="' + esc(link) + '">Partager…</button>' : "") +
      (member.referralsCompleted ? '<div class="hl-muted">' + fmt(member.referralsCompleted) + " ami(s) parrainé(s) 🎉</div>" : "") +
      "</div>");
  }

  function renderBody(state, opts) {
    if (!state.enabled) return '<div class="hl-empty">Le programme de fidélité est momentanément indisponible.</div>';
    var m = state.member;

    if (!m) {
      return bonusBanner(state) +
        '<div class="hl-guest"><p>' + esc(opts.guestText) + "</p>" +
        '<a class="hl-btn hl-btn-primary" href="' + esc(opts.registerUrl) + '">Rejoindre le programme</a>' +
        '<a class="hl-link" href="' + esc(opts.loginUrl) + '">J\'ai déjà un compte</a></div>' +
        earnList(state, null) + rewardsList(state, null) + referralBlock(state, null) + tiersList(state);
    }

    var perks = m.tier && m.tier.perks && m.tier.perks.length
      ? section("Mes avantages " + m.tier.name, m.tier.perks.map(function (perk) { return row("✨", esc(perk)); }).join(""))
      : "";
    var codes = m.codes.length
      ? section("Mes codes", m.codes.map(function (c) {
          return '<div class="hl-code"><div><div class="hl-reward-title">' + esc(c.title) + "</div><code>" + esc(c.code) +
            '</code></div><a class="hl-btn hl-btn-small" href="/discount/' + encodeURIComponent(c.code) + '?redirect=/cart">Utiliser</a></div>';
        }).join(""))
      : "";
    var expiry = m.expiresAt
      ? '<div class="hl-muted hl-center">Vos ' + esc(state.pointsName) + " restent valables jusqu'au " + esc(fmtDate(m.expiresAt)) +
        " (prolongés à chaque achat).</div>"
      : "";

    return bonusBanner(state) + perks + rewardsList(state, m) + codes + earnList(state, m) + referralBlock(state, m) + tiersList(state) + expiry;
  }

  function tiersList(state) {
    if (!state.tiers || state.tiers.length < 2) return "";
    return section("Niveaux", state.tiers.map(function (t) {
      return '<div class="hl-tier-row"><span class="hl-dot" style="background:' + esc(t.color) + '"></span><div><strong>' + esc(t.name) +
        "</strong> · dès " + fmt(t.minPoints) + " " + esc(state.pointsName) +
        (t.perks.length ? '<div class="hl-muted">' + t.perks.map(esc).join(" · ") + "</div>" : "") + "</div></div>";
    }).join(""));
  }

  function header(state, firstName) {
    var m = state.member;
    if (!m) {
      return '<div class="hl-header-label">' + esc(state.title) + "</div>" +
        '<div class="hl-header-big">Gagnez des ' + esc(state.pointsName) + "</div>";
    }
    var name = m.firstName || firstName;
    var progress = "";
    if (m.nextTier) {
      var target = m.lifetimePoints + m.nextTier.missing;
      var pct = Math.max(4, Math.min(100, Math.round((m.lifetimePoints / target) * 100)));
      progress = '<div class="hl-progress"><div style="width:' + pct + '%"></div></div>' +
        '<div class="hl-next">Encore ' + fmt(m.nextTier.missing) + " " + esc(state.pointsName) + " pour " + esc(m.nextTier.name) + "</div>";
    }
    return '<div class="hl-header-label">' + (name ? "Bonjour " + esc(name) + " 👋" : esc(state.title)) + "</div>" +
      '<div class="hl-header-big">' + fmt(m.points) + " <small>" + esc(state.pointsName) + "</small></div>" +
      (m.tier ? '<div class="hl-tier">★ ' + esc(m.tier.name) + "</div>" : "") + progress;
  }

  /* -------------------- Actions -------------------- */

  function bindActions(root) {
    root.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;

      var rewardBtn = t.closest("[data-reward]");
      if (rewardBtn && !rewardBtn.disabled) {
        var title = rewardBtn.closest(".hl-reward").querySelector(".hl-reward-title").textContent;
        if (!window.confirm("Échanger vos points contre « " + title + " » ?")) return;
        busy(rewardBtn, true);
        post({ action: "redeem", rewardId: rewardBtn.getAttribute("data-reward") }).then(function (res) {
          if (res.error) { toast(res.error, true); busy(rewardBtn, false); return; }
          update(res.state);
          modal('<div class="hl-modal-emoji">🎁</div><div class="hl-modal-title">Félicitations !</div>' +
            "<p>Votre récompense « " + esc(res.title) + " » est prête :</p>" + codeBlock(res.code) +
            '<button type="button" class="hl-link" data-close>Fermer</button>', res.state && res.state.color);
        }).catch(function () { toast("Une erreur est survenue, réessayez.", true); busy(rewardBtn, false); });
        return;
      }

      var socialBtn = t.closest("[data-social]");
      if (socialBtn) {
        window.open(socialBtn.getAttribute("data-url"), "_blank", "noopener");
        busy(socialBtn, true);
        post({ action: "social", network: socialBtn.getAttribute("data-social") }).then(function (res) {
          if (res.error) { toast(res.error, true); busy(socialBtn, false); return; }
          toast(res.message);
          update(res.state);
        });
        return;
      }

      var bdayBtn = t.closest("[data-birthday]");
      if (bdayBtn) {
        var form = bdayBtn.closest(".hl-birthday");
        var day = form.querySelector("[data-bday-day]").value;
        var month = form.querySelector("[data-bday-month]").value;
        if (!window.confirm("Votre anniversaire est le " + day + " " + MONTHS[month - 1] + " ? Il ne pourra plus être modifié.")) return;
        busy(bdayBtn, true);
        post({ action: "birthday", day: Number(day), month: Number(month) }).then(function (res) {
          if (res.error) { toast(res.error, true); busy(bdayBtn, false); return; }
          toast(res.message);
          update(res.state);
        });
        return;
      }

      var shareBtn = t.closest("[data-share]");
      if (shareBtn && navigator.share) {
        navigator.share({ title: document.title, text: "Profitez d'une réduction sur votre première commande !", url: shareBtn.getAttribute("data-share") }).catch(function () {});
      }
    });
  }
  function busy(btn, on) {
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = "…"; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  /* -------------------- Widget flottant -------------------- */

  function initWidget(el) {
    widgetOpts = {
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
      el.querySelector(".hl-body").innerHTML = renderBody(state, widgetOpts);
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
    bindActions(el);
    listeners.push(render);

    load().then(function (state) {
      if (!state || state.error || !state.enabled) { el.remove(); return; }
      render(state);
    }).catch(function () { el.remove(); });
  }

  /* -------------------- Carte dans une page -------------------- */

  function initCard(el) {
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
    bindActions(el);
    listeners.push(render);
    load().then(render).catch(function () { el.innerHTML = ""; });
  }

  /* -------------------- Points sur la fiche produit -------------------- */

  function initProductPoints(el) {
    var prices = {};
    try { prices = JSON.parse(el.dataset.prices || "{}"); } catch (e) {}
    var price = Number(el.dataset.price) || 0;
    var template = el.dataset.template || "Gagnez {points} {name} avec cet achat";

    function render(state) {
      if (!state || state.error || !state.enabled) { el.hidden = true; return; }
      var mult = state.member ? state.member.multiplier : state.bonus ? state.bonus.multiplier : 1;
      var points = Math.floor((price / 100) * state.pointsPerUnit * mult);
      if (points <= 0) { el.hidden = true; return; }
      el.style.setProperty("--hl-color", state.color || "#5C6AC4");
      el.hidden = false;
      el.innerHTML = '<span class="hl-star">★</span> ' +
        esc(template).replace("{points}", "<strong>" + fmt(points) + "</strong>").replace("{name}", esc(state.pointsName));
    }
    listeners.push(render);
    load().then(render).catch(function () { el.hidden = true; });

    // Changement de variante (formulaire produit standard)
    document.addEventListener("change", function (e) {
      if (!e.target || e.target.name !== "id") return;
      var p = prices[e.target.value];
      if (p != null) { price = p; load().then(render); }
    });
  }

  /* -------------------- Arrivée d'un ami parrainé -------------------- */

  function initReferralLanding() {
    var params = new URLSearchParams(location.search);
    var ref = params.get("parrain");
    if (ref) storage("hoshiRef", ref);
    ref = ref || storage("hoshiRef");
    if (!ref || storage("hoshiRefDone") === ref) return;
    try {
      if (!params.get("parrain") && sessionStorage.getItem("hoshiRefShown")) return;
      sessionStorage.setItem("hoshiRefShown", "1");
    } catch (e) {}

    fetch(ENDPOINT + "?ref=" + encodeURIComponent(ref), { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (info.error) { storage("hoshiRef", null); return; }
        var box = modal(
          '<div class="hl-modal-emoji">🎁</div><div class="hl-modal-title">' + esc(info.referrerName) + " vous fait un cadeau !</div>" +
          "<p>Profitez de <strong>" + esc(info.reward) + "</strong> sur votre première commande.</p>" +
          '<form class="hl-ref-form"><input type="email" required placeholder="Votre adresse e-mail" aria-label="E-mail">' +
          '<button type="submit" class="hl-btn hl-btn-primary">Recevoir mon code</button></form>' +
          '<button type="button" class="hl-link" data-close>Plus tard</button>', info.color);
        box.querySelector("form").addEventListener("submit", function (e) {
          e.preventDefault();
          var btn = box.querySelector("button[type=submit]");
          busy(btn, true);
          post({ action: "referral", ref: ref, email: box.querySelector("input").value }).then(function (res) {
            if (res.error) { toast(res.error, true); busy(btn, false); return; }
            storage("hoshiRefDone", ref);
            box.querySelector(".hl-modal-box").innerHTML =
              '<div class="hl-modal-emoji">🎉</div><div class="hl-modal-title">Votre code de bienvenue</div>' +
              "<p>" + esc(res.reward) + " sur votre première commande :</p>" + codeBlock(res.code) +
              '<button type="button" class="hl-link" data-close>Continuer mes achats</button>';
          });
        });
      })
      .catch(function () {});
  }

  /* -------------------- Démarrage -------------------- */

  function init() {
    var widget = document.getElementById("hoshi-loyalty");
    if (widget) initWidget(widget);
    document.querySelectorAll("[data-hoshi-card]").forEach(initCard);
    document.querySelectorAll("[data-hoshi-product-points]").forEach(initProductPoints);
    initReferralLanding();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
