/* Hoshi Club – widget boutique (sans dépendance, traduit dans la langue de la boutique) */
(function () {
  if (window.__hoshiClub) return;
  window.__hoshiClub = true;

  var ENDPOINT = "/apps/hoshi-club/loyalty";
  var REF_PARAM = "hoshi_ref";
  var SOCIAL_ICONS = { instagram: "📸", facebook: "👍", tiktok: "🎵" };
  var LOCALE = (document.querySelector("[data-hoshi-locale]") || {}).getAttribute
    ? document.querySelector("[data-hoshi-locale]").getAttribute("data-hoshi-locale")
    : document.documentElement.lang || "en";
  var I18N = {};
  var CURRENCY = "USD";
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
    try { return new Intl.NumberFormat(LOCALE).format(n); } catch (e) { return String(n); }
  }
  function money(n) {
    try { return new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, minimumFractionDigits: 0 }).format(n); }
    catch (e) { return String(n); }
  }
  function fmtDate(d, opts) {
    try { return new Date(d).toLocaleDateString(LOCALE, opts || { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return ""; }
  }
  function monthName(m) { return fmtDate(new Date(2024, m - 1, 1), { month: "long" }); }

  /** Texte traduit, échappé. Paramètre {b: x} = valeur mise en gras. */
  function T(key, params) {
    var text = I18N[key];
    if (params && typeof params.count === "number") {
      var cat = "other";
      try { cat = new Intl.PluralRules(LOCALE).select(params.count); } catch (e) {}
      text = I18N[key + "_" + cat] || I18N[key + "_other"] || text;
    }
    if (text == null) text = key;
    var out = esc(text);
    return out.replace(/\{(\w+)\}/g, function (m, name) {
      if (!params || params[name] == null) return m;
      var v = params[name];
      if (typeof v === "object") return "<strong>" + esc(typeof v.b === "number" ? fmt(v.b) : v.b) + "</strong>";
      return esc(typeof v === "number" ? fmt(v) : v);
    });
  }
  /** Version texte brut (pour confirm, attributs, toasts). */
  function TT(key, params) {
    var div = document.createElement("div");
    div.innerHTML = T(key, params);
    return div.textContent;
  }

  function storage(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  function url(extra) {
    return ENDPOINT + "?locale=" + encodeURIComponent(LOCALE) + (extra || "");
  }
  function applyState(state) {
    if (state && state.i18n) I18N = state.i18n;
    if (state && state.currency) CURRENCY = state.currency;
    return state;
  }
  function load(force) {
    if (cache && !force) return cache;
    cache = fetch(url(), { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(applyState);
    return cache;
  }
  function update(state) {
    applyState(state);
    cache = Promise.resolve(state);
    listeners.forEach(function (fn) { fn(state); });
  }
  function post(body) {
    return fetch(url(), {
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

  function modal(html, color, dir) {
    var overlay = document.createElement("div");
    overlay.className = "hl-modal";
    if (color) overlay.style.setProperty("--hl-color", color);
    if (dir) overlay.setAttribute("dir", dir);
    overlay.innerHTML = '<div class="hl-modal-box" role="dialog" aria-modal="true">' + html + "</div>";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || (e.target.hasAttribute && e.target.hasAttribute("data-close"))) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function codeBlock(code) {
    return '<button type="button" class="hl-modal-code" data-copy="' + esc(code) + '" title="' + T("copy") + '">' + esc(code) + "</button>" +
      '<a class="hl-btn hl-btn-primary" href="/discount/' + encodeURIComponent(code) + '?redirect=/cart">' + T("applyCart") + "</a>";
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-copy]");
    if (!el) return;
    var text = el.getAttribute("data-copy");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(TT("copied")); });
  });

  /* -------------------- Contenu du panneau -------------------- */

  function section(title, content) {
    return content ? '<div class="hl-section"><div class="hl-section-title">' + title + "</div>" + content + "</div>" : "";
  }
  function row(icon, html, action) {
    return '<div class="hl-way"><span class="hl-way-icon">' + icon + '</span><div class="hl-way-text">' + html + "</div>" + (action || "") + "</div>";
  }

  function bonusBanner(state) {
    if (!state.bonus) return "";
    return '<div class="hl-bonus">🔥 <strong>' + esc(state.bonus.label) + "</strong>" +
      (state.bonus.endsAt ? " " + T("bonusUntil", { date: fmtDate(state.bonus.endsAt) }) : "") + "</div>";
  }

  function rewardsList(state, member) {
    if (!state.rewards.length) return "";
    var p = state.pointsName;
    return section(T("rewardsTitle"), state.rewards.map(function (r) {
      var can = member && member.points >= r.pointsCost;
      var missing = member ? r.pointsCost - member.points : 0;
      return '<div class="hl-reward"><div><div class="hl-reward-title">' + esc(r.title) + "</div>" +
        '<div class="hl-reward-cost">' + esc(fmt(r.pointsCost) + " " + p) +
        (r.minSubtotal ? " · " + T("minimum", { amount: r.minSubtotal }) : "") + "</div></div>" +
        (member
          ? '<button type="button" class="hl-btn hl-btn-small' + (can ? " hl-btn-primary" : "") + '" data-reward="' + esc(r.id) + '"' +
            (can ? "" : " disabled") + ">" + (can ? T("redeem") : T("missing", { points: missing })) + "</button>"
          : "") + "</div>";
    }).join(""));
  }

  function earnList(state, member) {
    var p = state.pointsName;
    var mult = member ? member.multiplier : (state.bonus ? state.bonus.multiplier : 1);
    var html = row("🛍️", T("perUnit", { points: { b: Math.round(state.pointsPerUnit * mult * 100) / 100 }, pointsName: p, amount: money(1) }));
    if (!member && state.signupPoints > 0) html += row("🎉", T("signup", { points: { b: state.signupPoints }, pointsName: p }));
    if (state.firstOrderPoints > 0 && (!member || member.lifetimePoints <= state.signupPoints)) {
      html += row("🥇", T("firstOrder", { points: { b: state.firstOrderPoints }, pointsName: p }));
    }

    state.social.forEach(function (s) {
      var done = member && member.socialDone.indexOf(s.network) !== -1;
      html += row(SOCIAL_ICONS[s.network] || "⭐", T("follow", { network: s.label }) + " <strong>+" + fmt(state.socialPoints) + "</strong>",
        member
          ? done
            ? '<span class="hl-done">✓</span>'
            : '<button type="button" class="hl-btn hl-btn-small hl-btn-primary" data-social="' + esc(s.network) + '" data-url="' + esc(s.url) + '">' + T("followButton") + "</button>"
          : "");
    });

    if (state.birthdayPoints > 0) {
      if (!member) {
        html += row("🎂", T("birthdayGuest", { points: { b: state.birthdayPoints }, pointsName: p }));
      } else if (member.birthday) {
        var parts = member.birthday.split("-");
        html += row("🎂", T("birthdaySet", {
          date: { b: fmtDate(new Date(2024, Number(parts[0]) - 1, Number(parts[1])), { day: "numeric", month: "long" }) },
          points: state.birthdayPoints, pointsName: p,
        }));
      } else {
        var days = "", months = "";
        for (var d = 1; d <= 31; d++) days += '<option value="' + d + '">' + fmt(d) + "</option>";
        for (var m = 1; m <= 12; m++) months += '<option value="' + m + '">' + esc(monthName(m)) + "</option>";
        html += '<div class="hl-way hl-birthday"><span class="hl-way-icon">🎂</span><div class="hl-way-text">' +
          T("birthdayAsk") + " <strong>+" + fmt(state.birthdayPoints) + "</strong>" +
          '<div class="hl-birthday-form"><select data-bday-day aria-label="' + T("day") + '">' + days + "</select>" +
          '<select data-bday-month aria-label="' + T("month") + '">' + months + "</select>" +
          '<button type="button" class="hl-btn hl-btn-small hl-btn-primary" data-birthday>' + T("ok") + "</button></div></div></div>";
      }
    }
    return section(T("earnTitle", { pointsName: p }), html);
  }

  function referralBlock(state, member) {
    if (!state.referral) return "";
    var intro = T("referralIntro", {
      reward: { b: state.referral.friendReward },
      points: { b: state.referral.referrerPoints },
      pointsName: state.pointsName,
    });
    if (!member || !member.referralCode) return section(T("referralTitle"), '<div class="hl-referral"><p>' + intro + "</p></div>");
    var link = location.origin + "/?" + REF_PARAM + "=" + encodeURIComponent(member.referralCode);
    return section(T("referralMemberTitle"),
      '<div class="hl-referral"><p>' + intro + "</p>" +
      '<div class="hl-referral-link"><input readonly dir="ltr" value="' + esc(link) + '" aria-label="' + T("referralLink") + '">' +
      '<button type="button" class="hl-btn hl-btn-small hl-btn-primary" data-copy="' + esc(link) + '">' + T("copy") + "</button></div>" +
      (navigator.share ? '<button type="button" class="hl-link" data-share="' + esc(link) + '">' + T("share") + "</button>" : "") +
      (member.referralsCompleted ? '<div class="hl-muted">' + T("referralsDone", { count: member.referralsCompleted }) + "</div>" : "") +
      "</div>");
  }

  function tiersList(state) {
    if (!state.tiers || state.tiers.length < 2) return "";
    return section(T("tiersTitle"), state.tiers.map(function (t) {
      return '<div class="hl-tier-row"><span class="hl-dot" style="background:' + esc(t.color) + '"></span><div><strong>' + esc(t.name) +
        "</strong> · " + T("tierFrom", { points: t.minPoints, pointsName: state.pointsName }) +
        (t.perks.length ? '<div class="hl-muted">' + t.perks.map(esc).join(" · ") + "</div>" : "") + "</div></div>";
    }).join(""));
  }

  function renderBody(state, opts) {
    if (!state.enabled) return '<div class="hl-empty">' + T("unavailable") + "</div>";
    var m = state.member;

    if (!m) {
      return bonusBanner(state) +
        '<div class="hl-guest"><p>' + (opts.guestText ? esc(opts.guestText) : T("guestText")) + "</p>" +
        '<a class="hl-btn hl-btn-primary" href="' + esc(opts.registerUrl) + '">' + T("join") + "</a>" +
        '<a class="hl-link" href="' + esc(opts.loginUrl) + '">' + T("haveAccount") + "</a></div>" +
        earnList(state, null) + rewardsList(state, null) + referralBlock(state, null) + tiersList(state);
    }

    var perks = m.tier && m.tier.perks && m.tier.perks.length
      ? section(T("perksTitle", { tier: m.tier.name }), m.tier.perks.map(function (perk) { return row("✨", esc(perk)); }).join(""))
      : "";
    var codes = m.codes.length
      ? section(T("codesTitle"), m.codes.map(function (c) {
          return '<div class="hl-code"><div><div class="hl-reward-title">' + esc(c.title) + '</div><code dir="ltr">' + esc(c.code) +
            '</code></div><a class="hl-btn hl-btn-small" href="/discount/' + encodeURIComponent(c.code) + '?redirect=/cart">' + T("useCode") + "</a></div>";
        }).join(""))
      : "";
    var expiry = m.expiresAt
      ? '<div class="hl-muted hl-center">' + T("expires", { pointsName: state.pointsName, date: fmtDate(m.expiresAt) }) + "</div>"
      : "";

    return bonusBanner(state) + perks + rewardsList(state, m) + codes + earnList(state, m) + referralBlock(state, m) + tiersList(state) + expiry;
  }

  function header(state, firstName) {
    var m = state.member;
    if (!m) {
      return '<div class="hl-header-label">' + esc(state.title) + "</div>" +
        '<div class="hl-header-big">' + T("earnTitle", { pointsName: state.pointsName }) + "</div>";
    }
    var name = m.firstName || firstName;
    var progress = "";
    if (m.nextTier) {
      var target = m.lifetimePoints + m.nextTier.missing;
      var pct = Math.max(4, Math.min(100, Math.round((m.lifetimePoints / target) * 100)));
      progress = '<div class="hl-progress"><div style="width:' + pct + '%"></div></div>' +
        '<div class="hl-next">' + T("nextTier", { points: m.nextTier.missing, pointsName: state.pointsName, tier: m.nextTier.name }) + "</div>";
    }
    return '<div class="hl-header-label">' + (name ? T("hello", { name: name }) + " 👋" : esc(state.title)) + "</div>" +
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
        if (!window.confirm(TT("confirmRedeem", { reward: title }))) return;
        busy(rewardBtn, true);
        post({ action: "redeem", rewardId: rewardBtn.getAttribute("data-reward") }).then(function (res) {
          if (res.error) { toast(res.error, true); busy(rewardBtn, false); return; }
          update(res.state);
          modal('<div class="hl-modal-emoji">🎁</div><div class="hl-modal-title">' + T("congrats") + "</div>" +
            "<p>" + T("rewardReady", { reward: res.title }) + "</p>" + codeBlock(res.code) +
            '<button type="button" class="hl-link" data-close>' + T("close") + "</button>", res.state && res.state.color, res.state && res.state.dir);
        }).catch(function () { toast(TT("errorGeneric"), true); busy(rewardBtn, false); });
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
        var day = Number(form.querySelector("[data-bday-day]").value);
        var month = Number(form.querySelector("[data-bday-month]").value);
        var label = fmtDate(new Date(2024, month - 1, day), { day: "numeric", month: "long" });
        if (!window.confirm(TT("birthdayConfirm", { date: label }))) return;
        busy(bdayBtn, true);
        post({ action: "birthday", day: day, month: month }).then(function (res) {
          if (res.error) { toast(res.error, true); busy(bdayBtn, false); return; }
          toast(res.message);
          update(res.state);
        });
        return;
      }

      var shareBtn = t.closest("[data-share]");
      if (shareBtn && navigator.share) {
        navigator.share({ title: document.title, text: TT("shareText"), url: shareBtn.getAttribute("data-share") }).catch(function () {});
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
      '<div class="hl-header"><button type="button" class="hl-close">×</button><div class="hl-header-content"></div></div>' +
      '<div class="hl-body"><div class="hl-loading">…</div></div></div>';

    var launcher = el.querySelector(".hl-launcher");
    var panel = el.querySelector(".hl-panel");

    function render(state) {
      if (state.error) return;
      el.style.setProperty("--hl-color", state.color || "#5C6AC4");
      el.setAttribute("dir", state.dir || "ltr");
      var pos = el.dataset.position === "app" ? state.position || "right" : el.dataset.position;
      el.classList.toggle("hl-left", pos === "left");
      var label = el.dataset.label || state.title;
      if (state.member) label += " · " + fmt(state.member.points);
      el.querySelector(".hl-launcher-label").textContent = label;
      el.querySelector(".hl-close").setAttribute("aria-label", TT("close"));
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
    var opts = { guestText: "", loginUrl: el.dataset.loginUrl, registerUrl: el.dataset.registerUrl };
    el.innerHTML = '<div class="hl-loading">…</div>';
    function render(state) {
      if (state.error) { el.innerHTML = ""; return; }
      el.style.setProperty("--hl-color", state.color || "#5C6AC4");
      el.setAttribute("dir", state.dir || "ltr");
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
    var custom = el.dataset.template;

    function render(state) {
      if (!state || state.error || !state.enabled) { el.hidden = true; return; }
      var mult = state.member ? state.member.multiplier : state.bonus ? state.bonus.multiplier : 1;
      var points = Math.floor((price / 100) * state.pointsPerUnit * mult);
      if (points <= 0) { el.hidden = true; return; }
      el.style.setProperty("--hl-color", state.color || "#5C6AC4");
      el.setAttribute("dir", state.dir || "ltr");
      el.hidden = false;
      var text = custom
        ? esc(custom).replace("{points}", "<strong>" + fmt(points) + "</strong>").replace("{name}", esc(state.pointsName))
        : T("productPoints", { points: { b: points }, pointsName: state.pointsName });
      el.innerHTML = '<span class="hl-star">★</span> ' + text;
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
    var ref = params.get(REF_PARAM);
    if (ref) storage("hoshiRef", ref);
    ref = ref || storage("hoshiRef");
    if (!ref || storage("hoshiRefDone") === ref) return;
    try {
      if (!params.get(REF_PARAM) && sessionStorage.getItem("hoshiRefShown")) return;
      sessionStorage.setItem("hoshiRefShown", "1");
    } catch (e) {}

    fetch(url("&ref=" + encodeURIComponent(ref)), { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (info.error) { storage("hoshiRef", null); return; }
        applyState(info);
        var box = modal(
          '<div class="hl-modal-emoji">🎁</div><div class="hl-modal-title">' + T("giftTitle", { name: info.referrerName }) + "</div>" +
          "<p>" + T("giftText", { reward: { b: info.reward } }) + "</p>" +
          '<form class="hl-ref-form"><input type="email" required dir="ltr" placeholder="' + T("emailPlaceholder") + '" aria-label="' + T("emailPlaceholder") + '">' +
          '<button type="submit" class="hl-btn hl-btn-primary">' + T("getCode") + "</button></form>" +
          '<button type="button" class="hl-link" data-close>' + T("later") + "</button>", info.color, info.dir);
        box.querySelector("form").addEventListener("submit", function (e) {
          e.preventDefault();
          var btn = box.querySelector("button[type=submit]");
          busy(btn, true);
          post({ action: "referral", ref: ref, email: box.querySelector("input").value }).then(function (res) {
            if (res.error) { toast(res.error, true); busy(btn, false); return; }
            storage("hoshiRefDone", ref);
            box.querySelector(".hl-modal-box").innerHTML =
              '<div class="hl-modal-emoji">🎉</div><div class="hl-modal-title">' + T("welcomeCodeTitle") + "</div>" +
              "<p>" + T("welcomeCodeText", { reward: res.reward }) + "</p>" + codeBlock(res.code) +
              '<button type="button" class="hl-link" data-close>' + T("continueShopping") + "</button>";
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
