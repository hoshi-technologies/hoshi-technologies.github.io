/*
 * Hoshi Sports : moteur commun aux sports (football, basket, tennis, rugby).
 *
 * Modèle : note Elo par équipe (ou par joueur au tennis), rejouée sur l'historique dans
 * l'ordre chronologique, avec avantage du terrain et, pour les sports où le nul existe,
 * un modèle logistique ordonné (victoire domicile / nul / victoire extérieur).
 *
 * Fonctionne dans le navigateur (window.HoshiSports) et sous Node (module.exports).
 */
(function (root) {
  'use strict';

  // Compétitions suivies. `espn` = chemin de l'API publique ESPN (site.api.espn.com).
  var SPORTS = {
    foot: {
      label: 'Football',
      icon: '⚽',
      draws: true,
      leagues: [
        { key: 'fra.1', espn: 'soccer/fra.1', label: 'Ligue 1' },
        { key: 'eng.1', espn: 'soccer/eng.1', label: 'Premier League' },
        { key: 'esp.1', espn: 'soccer/esp.1', label: 'Liga' },
        { key: 'ita.1', espn: 'soccer/ita.1', label: 'Serie A' },
        { key: 'ger.1', espn: 'soccer/ger.1', label: 'Bundesliga' },
        { key: 'uefa.champions', espn: 'soccer/uefa.champions', label: 'Ligue des champions' },
      ],
    },
    tennis: {
      label: 'Tennis',
      icon: '🎾',
      draws: false,
      individual: true,
      leagues: [
        { key: 'atp', espn: 'tennis/atp', label: 'ATP' },
        { key: 'wta', espn: 'tennis/wta', label: 'WTA' },
      ],
    },
    basket: {
      label: 'Basket',
      icon: '🏀',
      draws: false,
      leagues: [{ key: 'nba', espn: 'basketball/nba', label: 'NBA' }],
    },
    rugby: {
      label: 'Rugby',
      icon: '🏉',
      draws: true,
      leagues: [
        { key: 'urc', espn: 'rugby/270557', label: 'United Rugby Championship' },
        { key: 'top14', espn: 'rugby/270559', label: 'Top 14' },
        { key: 'champions-cup', espn: 'rugby/271937', label: 'Champions Cup' },
        { key: 'six-nations', espn: 'rugby/180659', label: 'Tournoi des Six Nations' },
      ],
    },
  };

  // Réglages par défaut (remplacés par le calibrage de chaque sport).
  var DEFAULTS = {
    foot: { K: 24, H: 60, c: 0.55, gd: true },
    rugby: { K: 28, H: 70, c: 1.6, gd: true },
    basket: { K: 18, H: 70, c: 0, gd: false },
    tennis: { K: 0, H: 0, c: 0, gd: false, tennis: true },
  };

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  /** Cote américaine (+150 / −200) → cote décimale (2,50 / 1,50). */
  function americanToDecimal(ml) {
    var m = typeof ml === 'number' ? ml : parseFloat(String(ml || '').replace(/[^\d.+-]/g, ''));
    if (!isFinite(m) || m === 0) return null;
    return +(m > 0 ? 1 + m / 100 : 1 + 100 / -m).toFixed(3);
  }

  /** Probabilités implicites des cotes, marge du bookmaker retirée. */
  function impliedProbs(odds) {
    var keys = Object.keys(odds || {}).filter((k) => odds[k] > 1);
    if (keys.length < 2) return null;
    var inv = {},
      t = 0;
    keys.forEach(function (k) {
      inv[k] = 1 / odds[k];
      t += inv[k];
    });
    var out = { margin: t - 1 };
    keys.forEach(function (k) {
      out[k] = inv[k] / t;
    });
    return out;
  }

  /**
   * Probabilités d'un match à partir de l'écart de notes (avantage du terrain compris).
   * Avec nul : modèle logistique ordonné de seuil c. Sans nul : simple logistique Elo.
   */
  function matchProbs(rHome, rAway, params, neutral) {
    var p = params || {};
    var d = rHome - rAway + (neutral ? 0 : p.H || 0);
    var x = (d / 400) * Math.LN10;
    if (!p.c) {
      var ph = 1 / (1 + Math.exp(-x));
      return { h: ph, d: 0, a: 1 - ph };
    }
    var pH = 1 / (1 + Math.exp(-(x - p.c)));
    var pA = 1 / (1 + Math.exp(x + p.c));
    return { h: pH, d: Math.max(0, 1 - pH - pA), a: pA };
  }

  /** Coefficient K du tennis : il diminue avec l'expérience du joueur (méthode FiveThirtyEight). */
  function tennisK(n) {
    return 250 / Math.pow((n || 0) + 5, 0.4);
  }

  /**
   * Rejoue les matchs terminés dans l'ordre chronologique et renvoie les notes finales.
   * Si `onMatch` est fourni, il reçoit la prédiction faite AVANT la mise à jour (prévision honnête).
   */
  function replay(events, params, onMatch) {
    var R = {},
      N = {};
    var get = function (id) {
      return R[id] != null ? R[id] : 1500;
    };
    var list = events
      .filter(function (e) {
        return e.status === 'post' && e.winner && e.home && e.away;
      })
      .sort(function (a, b) {
        return a.date - b.date;
      });
    list.forEach(function (e) {
      var h = e.home.id,
        a = e.away.id;
      var pr = matchProbs(get(h), get(a), params, e.neutral || params.tennis);
      if (onMatch) onMatch(e, pr, N[h] || 0, N[a] || 0);
      var S = e.winner === 'home' ? 1 : e.winner === 'away' ? 0 : 0.5;
      var E = pr.h + pr.d / 2;
      var K;
      if (params.tennis) K = (tennisK(N[h]) + tennisK(N[a])) / 2;
      else {
        K = params.K || 20;
        if (params.gd && e.score) {
          var gd = Math.abs((e.score[0] || 0) - (e.score[1] || 0));
          K *= gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + Math.min(gd, 30)) / 8;
        }
      }
      R[h] = get(h) + K * (S - E);
      R[a] = get(a) - K * (S - E);
      N[h] = (N[h] || 0) + 1;
      N[a] = (N[a] || 0) + 1;
    });
    return { ratings: R, games: N, matches: list.length };
  }

  /** Perte logarithmique de la prévision d'un match (plus bas = mieux). */
  function logLoss(pr, winner) {
    var p = winner === 'home' ? pr.h : winner === 'away' ? pr.a : pr.d;
    return -Math.log(Math.max(p, 1e-6));
  }

  /**
   * Calibre K, l'avantage du terrain et le seuil de nul par recherche sur grille, en
   * minimisant la perte des prévisions faites avant chaque match (première moitié ignorée :
   * les notes doivent d'abord se former).
   */
  function calibrate(events, sportKey) {
    var base = Object.assign({}, DEFAULTS[sportKey] || DEFAULTS.foot);
    var score = function (params) {
      var loss = 0,
        n = 0,
        k = 0,
        total = events.filter((e) => e.status === 'post' && e.winner).length;
      replay(events, params, function (e, pr) {
        k++;
        if (k < total * 0.4) return;
        loss += logLoss(pr, e.winner);
        n++;
      });
      return n ? loss / n : Infinity;
    };
    if (base.tennis) return { params: base, loss: score(base) };
    var best = { params: base, loss: score(base) };
    var Ks = [10, 15, 20, 25, 30, 40];
    var Hs = [0, 30, 50, 70, 90, 110];
    var Cs = base.c ? (sportKey === 'rugby' ? [1.2, 1.6, 2, 2.5] : [0.35, 0.45, 0.55, 0.65, 0.75]) : [0];
    Ks.forEach(function (K) {
      Hs.forEach(function (H) {
        Cs.forEach(function (c) {
          var p = Object.assign({}, base, { K: K, H: H, c: c });
          var l = score(p);
          if (l < best.loss) best = { params: p, loss: l };
        });
      });
    });
    return best;
  }

  /** Combine le modèle et le marché (moyenne géométrique pondérée, renormalisée). */
  function blend(model, market, alpha) {
    if (!market || !alpha) return model;
    var out = {},
      t = 0;
    ['h', 'd', 'a'].forEach(function (k) {
      if (model[k] == null) return;
      var m = market[k] != null ? market[k] : model[k];
      out[k] = Math.pow(Math.max(model[k], 1e-6), 1 - alpha) * Math.pow(Math.max(m, 1e-6), alpha);
      t += out[k];
    });
    ['h', 'd', 'a'].forEach(function (k) {
      if (out[k] != null) out[k] /= t;
    });
    if (!model.d) out.d = 0;
    return out;
  }

  /** Fraction de Kelly. */
  function kelly(p, o) {
    if (!p || !o || o <= 1) return 0;
    return Math.max(0, (p * o - 1) / (o - 1));
  }

  var api = {
    SPORTS: SPORTS,
    DEFAULTS: DEFAULTS,
    americanToDecimal: americanToDecimal,
    impliedProbs: impliedProbs,
    matchProbs: matchProbs,
    replay: replay,
    calibrate: calibrate,
    logLoss: logLoss,
    blend: blend,
    kelly: kelly,
    tennisK: tennisK,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HoshiSports = api;
})(typeof window !== 'undefined' ? window : this);
