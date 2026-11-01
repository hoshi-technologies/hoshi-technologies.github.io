/*
 * Hoshi Turf : moteur d'analyse des courses hippiques.
 *
 * Entrée : une course (discipline, liste de partants avec leurs données).
 * Sortie : pour chaque cheval, des sous-notes (0-100), une note globale /20,
 * une probabilité de victoire, de place (règle PMU) et de top 3, une cote juste
 * et un indice de valeur par rapport à la cote du marché.
 *
 * Fonctionne dans le navigateur (window.HoshiTurf) et sous Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Musique
  // ---------------------------------------------------------------------------

  // Valeur (0-100) d'un résultat de musique.
  var PLACE_VALUE = { 1: 100, 2: 86, 3: 74, 4: 63, 5: 54, 6: 46, 7: 39, 8: 32, 9: 26, 0: 16 };
  var INCIDENT_VALUE = { D: 14, A: 8, T: 6, R: 8, I: 10 };
  var DISCIPLINES = { a: 'attelé', m: 'monté', p: 'plat', h: 'haies', s: 'steeple', c: 'cross', o: 'obstacle' };

  /**
   * Analyse une musique PMU, ex. « 1p 3p (25) 2p Da 0p ».
   * La plus récente est à gauche. (25) marque le changement d'année.
   * Renvoie une liste de { result, place, incident, discipline, yearsAgo }.
   */
  function parseMusique(str) {
    var out = [];
    if (!str) return out;
    var s = String(str).replace(/\s+/g, '');
    var yearsAgo = 0;
    var re = /\((\d{1,4})\)|([0-9]|[DATRI])([a-z])?/gi;
    var m;
    while ((m = re.exec(s))) {
      if (m[1] !== undefined) {
        yearsAgo++;
        continue;
      }
      var tok = m[2].toUpperCase();
      var isPlace = /[0-9]/.test(tok);
      out.push({
        result: tok,
        place: isPlace ? parseInt(tok, 10) : null,
        incident: isPlace ? null : tok,
        discipline: m[3] ? DISCIPLINES[m[3].toLowerCase()] || m[3] : null,
        yearsAgo: yearsAgo,
      });
    }
    return out;
  }

  /** Statistiques de forme issues de la musique. */
  function musiqueStats(str, maxRuns) {
    var runs = parseMusique(str).slice(0, maxRuns || 10);
    if (!runs.length) return null;
    var wSum = 0,
      vSum = 0,
      incidents = 0,
      podiums = 0,
      wins = 0;
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      // Décroissance avec l'ancienneté de la course et changement d'année.
      var w = Math.pow(0.8, i) * Math.pow(0.75, r.yearsAgo);
      var v = r.place !== null ? PLACE_VALUE[r.place] : INCIDENT_VALUE[r.incident] || 10;
      wSum += w;
      vSum += w * v;
      if (r.incident) incidents++;
      if (r.place !== null && r.place >= 1 && r.place <= 3) podiums++;
      if (r.place === 1) wins++;
    }
    // Tendance : 3 dernières vs 3 précédentes.
    var val = function (r) {
      return r.place !== null ? PLACE_VALUE[r.place] : INCIDENT_VALUE[r.incident] || 10;
    };
    var recent = runs.slice(0, 3).map(val);
    var before = runs.slice(3, 6).map(val);
    var avg = function (a) {
      return a.reduce(function (x, y) {
        return x + y;
      }, 0) / a.length;
    };
    var trend = recent.length && before.length ? avg(recent) - avg(before) : 0;
    // Confiance : peu de courses = forme moins fiable, ramenée vers 45.
    var conf = Math.min(1, runs.length / 5);
    var raw = vSum / wSum;
    return {
      runs: runs,
      count: runs.length,
      score: 45 + (raw - 45) * conf,
      trend: trend,
      incidents: incidents,
      incidentRate: incidents / runs.length,
      podiumRate: podiums / runs.length,
      wins: wins,
    };
  }

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }
  function mean(a) {
    return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  }
  function std(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(mean(a.map((x) => (x - m) * (x - m))));
  }
  /** Note 0-100 à partir d'un z-score dans le champ. */
  function zToScore(z) {
    return clamp(50 + 18 * z, 2, 98);
  }
  /** Lissage bayésien d'un taux (succès / essais) vers un a priori. */
  function shrinkRate(success, trials, prior, strength) {
    return (success + prior * strength) / (trials + strength);
  }

  // Générateur pseudo-aléatoire reproductible (mulberry32).
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Critères
  // ---------------------------------------------------------------------------

  var CRITERIA = [
    { key: 'forme', label: 'Forme (musique)', weight: 30 },
    { key: 'regularite', label: 'Régularité carrière', weight: 15 },
    { key: 'classe', label: 'Classe (gains/course)', weight: 15 },
    { key: 'jockey', label: 'Jockey / driver', weight: 10 },
    { key: 'entraineur', label: 'Entraîneur', weight: 10 },
    { key: 'aptitude', label: 'Aptitude distance/terrain', weight: 8 },
    { key: 'handicap', label: 'Poids / recul / corde', weight: 6 },
    { key: 'fraicheur', label: 'Fraîcheur (repos)', weight: 6 },
  ];

  var DEFAULT_SETTINGS = {
    weights: CRITERIA.reduce(function (o, c) {
      o[c.key] = c.weight;
      return o;
    }, {}),
    marketWeight: 0.5, // part du marché (cotes) dans la probabilité finale
    temperature: 11, // dispersion : plus petit = favoris plus marqués
    placeDiscount: 0.8, // correctif Henery/Lo pour les places 2 et 3
    simulations: 30000,
    seed: 20261101,
  };

  var APTITUDE = { '': null, inconnue: null, faible: 25, moyenne: 50, bonne: 75, excellente: 92 };

  function placesPayees(nPartants) {
    if (nPartants < 4) return 0;
    if (nPartants < 8) return 2;
    return 3;
  }

  /** Calcule les sous-notes de chaque partant (0-100, null si inconnu). */
  function computeSubScores(runners, discipline) {
    var isTrot = /trot/i.test(discipline || '');

    var classeRaw = runners.map(function (r) {
      var g = num(r.gains),
        c = num(r.courses);
      return g !== null && c ? Math.log1p(g / c) : null;
    });
    var classeKnown = classeRaw.filter((x) => x !== null);
    var cMean = mean(classeKnown),
      cStd = std(classeKnown) || 1;

    // Poids (galop) : plus léger que la moyenne = avantage (~1,5 pt/kg).
    // Recul (trot) : +25 m = handicap. Corde : légère prime aux petites cordes en plat.
    var poids = runners.map((r) => num(r.poids));
    // Trot : recul en mètres, saisi directement ou déduit de la distance de chaque cheval.
    var dists = runners.map((r) => num(r.distanceCheval));
    var dKnown = dists.filter((x) => x !== null);
    var dMin = dKnown.length ? Math.min.apply(null, dKnown) : null;
    var reculs = runners.map(function (r, i) {
      var v = num(r.recul);
      if (v === null) v = num(r.poids); // colonne « Poids/Recul » au trot
      if (v !== null) return v;
      return dists[i] !== null ? dists[i] - dMin : null;
    });
    var pKnown = poids.filter((x) => x !== null);
    var pMean = mean(pKnown);

    return runners.map(function (r, i) {
      var s = {};
      var ms = musiqueStats(r.musique);
      s.forme = ms ? clamp(ms.score + clamp(ms.trend, -30, 30) * 0.15, 0, 100) : null;
      // Fiabilité : au trot les fautes (D) pèsent lourd.
      if (ms && isTrot) s.forme = clamp(s.forme - ms.incidentRate * 15, 0, 100);

      var courses = num(r.courses),
        vict = num(r.victoires),
        places = num(r.places);
      if (courses) {
        // places = nombre d'arrivées dans les 3 (victoires incluses au PMU)
        var placeRate = shrinkRate(places !== null ? places : vict || 0, courses, 0.3, 6);
        var winRate = shrinkRate(vict || 0, courses, 0.1, 6);
        s.regularite = clamp(placeRate * 110 + winRate * 60, 0, 100);
      } else s.regularite = null;

      s.classe = classeRaw[i] !== null ? zToScore((classeRaw[i] - cMean) / cStd) : null;

      var jk = num(r.jockey);
      s.jockey = jk !== null ? clamp(20 + jk * 3, 0, 100) : null; // 10 % → 50, 20 % → 80
      var en = num(r.entraineur);
      s.entraineur = en !== null ? clamp(20 + en * 3, 0, 100) : null;

      s.aptitude = r.aptitude in APTITUDE ? APTITUDE[r.aptitude] : null;

      var h = null;
      if (isTrot) {
        if (reculs[i] !== null) h = 55 - (reculs[i] / 25) * 12; // chaque 25 m de recul pénalise
      } else if (poids[i] !== null && pKnown.length > 1) h = 50 + (pMean - poids[i]) * 3;
      var corde = num(r.corde);
      if (corde !== null && !isTrot && runners.length > 6) {
        var c = 50 + ((runners.length / 2 - corde) / runners.length) * 20;
        h = h === null ? c : h * 0.7 + c * 0.3;
      }
      s.handicap = h === null ? null : clamp(h, 0, 100);

      var repos = num(r.repos);
      if (repos !== null) {
        var f;
        if (repos < 7) f = 45;
        else if (repos <= 45) f = 75;
        else if (repos <= 90) f = 60;
        else if (repos <= 180) f = 42;
        else f = 30;
        s.fraicheur = f;
      } else s.fraicheur = null;

      return { scores: s, musique: ms };
    });
  }

  /** Probabilités du marché à partir des cotes (marge du bookmaker retirée). */
  function marketProbs(runners) {
    var inv = runners.map(function (r) {
      var c = num(r.cote);
      return c && c > 1 ? 1 / c : null;
    });
    var known = inv.filter((x) => x !== null);
    if (known.length < Math.max(2, runners.length * 0.6)) return null;
    // Cote manquante : on suppose un outsider (proba du moins coté du champ).
    var minInv = Math.min.apply(null, known);
    var filled = inv.map((x) => (x === null ? minInv : x));
    var total = filled.reduce((a, b) => a + b, 0);
    return { probs: filled.map((x) => x / total), overround: known.reduce((a, b) => a + b, 0) };
  }

  /**
   * Simulation Monte-Carlo de l'arrivée (modèle de Plackett-Luce,
   * avec correctif pour les 2e/3e places).
   */
  function simulate(probs, settings) {
    var n = probs.length;
    var N = settings.simulations;
    var rand = rng(settings.seed);
    var lam = settings.placeDiscount;
    var top = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    var trios = {};
    var adj = probs.map((p) => Math.pow(p, lam));
    var depth = Math.min(3, n);
    var used = new Uint8Array(n);
    for (var k = 0; k < N; k++) {
      used.fill(0);
      var picked = [];
      for (var pos = 0; pos < depth; pos++) {
        var w = pos === 0 ? probs : adj;
        var tot = 0;
        for (var i = 0; i < n; i++) if (!used[i]) tot += w[i];
        var x = rand() * tot,
          j = -1;
        for (i = 0; i < n; i++) {
          if (used[i]) continue;
          x -= w[i];
          j = i;
          if (x <= 0) break;
        }
        used[j] = 1;
        picked.push(j);
        top[pos][j]++;
      }
      if (depth === 3) {
        var key = picked.slice().sort((a, b) => a - b).join('-');
        trios[key] = (trios[key] || 0) + 1;
      }
    }
    var pos1 = Array.from(top[0], (c) => c / N);
    var pos2 = Array.from(top[1], (c) => c / N);
    var pos3 = Array.from(top[2], (c) => c / N);
    var trioList = Object.keys(trios)
      .map((k) => ({ idx: k.split('-').map(Number), p: trios[k] / N }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 10);
    return { pos1: pos1, pos2: pos2, pos3: pos3, trios: trioList };
  }

  /** Analyse complète d'une course. */
  function analyzeRace(race, userSettings) {
    var settings = Object.assign({}, DEFAULT_SETTINGS, userSettings || {});
    settings.weights = Object.assign({}, DEFAULT_SETTINGS.weights, (userSettings || {}).weights || {});

    var runners = (race.runners || []).filter((r) => !r.nonPartant && (r.nom || r.num));
    var n = runners.length;
    if (n < 2) return { error: 'Il faut au moins 2 partants.', runners: [] };

    var subs = computeSubScores(runners, race.discipline);

    // Score global : moyenne pondérée des critères connus, critères inconnus
    // remplacés par une valeur neutre (45) et confiance mesurée.
    var totalW = CRITERIA.reduce((s, c) => s + (settings.weights[c.key] || 0), 0) || 1;
    var results = runners.map(function (r, i) {
      var s = subs[i].scores,
        acc = 0,
        known = 0;
      CRITERIA.forEach(function (c) {
        var w = settings.weights[c.key] || 0;
        var v = s[c.key];
        if (v === null || v === undefined) v = 45;
        else known += w;
        acc += w * v;
      });
      return {
        runner: r,
        scores: s,
        musique: subs[i].musique,
        score: acc / totalW,
        confidence: known / totalW,
      };
    });

    // Probabilité modèle : softmax des scores.
    var T = settings.temperature;
    var maxS = Math.max.apply(
      null,
      results.map((x) => x.score),
    );
    var ex = results.map((x) => Math.exp((x.score - maxS) / T));
    var exSum = ex.reduce((a, b) => a + b, 0);
    var pModel = ex.map((e) => e / exSum);

    // Combinaison log-linéaire avec le marché.
    var mk = marketProbs(runners);
    var alpha = mk ? clamp(settings.marketWeight, 0, 1) : 0;
    var comb = pModel.map(function (p, i) {
      return mk ? Math.pow(p, 1 - alpha) * Math.pow(mk.probs[i], alpha) : p;
    });
    var cSum = comb.reduce((a, b) => a + b, 0);
    var pWin = comb.map((p) => p / cSum);

    var sim = simulate(pWin, settings);
    var nPlaces = placesPayees(n);

    // Note /20 : score absolu (60 %) + rang relatif dans le champ (40 %).
    var order = results
      .map((x, i) => i)
      .sort((a, b) => results[b].score - results[a].score);
    var rank = new Array(n);
    order.forEach((idx, k) => (rank[idx] = k));

    results.forEach(function (x, i) {
      var rel = n > 1 ? 1 - rank[i] / (n - 1) : 0.5;
      x.note = clamp((0.6 * x.score + 0.4 * rel * 100) / 5, 0, 20);
      x.rank = rank[i] + 1;
      x.pModel = pModel[i];
      x.pMarket = mk ? mk.probs[i] : null;
      x.pWin = pWin[i];
      x.p2 = sim.pos2[i];
      x.p3 = sim.pos3[i];
      x.pTop2 = sim.pos1[i] + sim.pos2[i];
      x.pTop3 = sim.pos1[i] + sim.pos2[i] + sim.pos3[i];
      x.pPlace = nPlaces === 0 ? null : nPlaces === 2 ? x.pTop2 : x.pTop3;
      x.coteJuste = 1 / pWin[i];
      var cote = num(x.runner.cote);
      x.value = cote ? pWin[i] * cote : null; // > 1 : cote supérieure à la cote juste
    });

    return {
      discipline: race.discipline,
      nPartants: n,
      placesPayees: nPlaces,
      market: mk,
      settings: settings,
      runners: results,
      trios: sim.trios.map((t) => ({ runners: t.idx.map((i) => results[i]), p: t.p })),
    };
  }

  // ---------------------------------------------------------------------------
  // Import PMU (JSON des participants de l'API turfinfo)
  // ---------------------------------------------------------------------------

  function fromPmuParticipants(json) {
    var list = Array.isArray(json) ? json : json && json.participants;
    if (!Array.isArray(list)) throw new Error('JSON PMU non reconnu (champ « participants » absent).');
    return list.map(function (p) {
      var gains = p.gainsParticipant && (p.gainsParticipant.gainsCarriere || 0) / 100;
      var rapport =
        (p.dernierRapportDirect && p.dernierRapportDirect.rapport) ||
        (p.dernierRapportReference && p.dernierRapportReference.rapport) ||
        '';
      var poids = p.handicapPoids ? p.handicapPoids / 10 : p.poidsConditionMonte ? p.poidsConditionMonte / 10 : '';
      return {
        num: p.numPmu || '',
        nom: p.nom || '',
        cote: rapport || '',
        musique: p.musique || '',
        gains: gains || '',
        courses: p.nombreCourses || '',
        victoires: p.nombreVictoires != null ? p.nombreVictoires : '',
        places: p.nombrePlaces != null ? p.nombrePlaces : '',
        jockey: '',
        entraineur: '',
        jockeyNom: p.driver || p.jockey || '',
        entraineurNom: p.entraineur || '',
        poids: poids,
        recul: '',
        distanceCheval: p.handicapDistance || '',
        corde: p.placeCorde || '',
        repos: '',
        aptitude: '',
        nonPartant: p.statut === 'NON_PARTANT',
      };
    });
  }

  var api = {
    parseMusique: parseMusique,
    musiqueStats: musiqueStats,
    analyzeRace: analyzeRace,
    marketProbs: marketProbs,
    placesPayees: placesPayees,
    fromPmuParticipants: fromPmuParticipants,
    CRITERIA: CRITERIA,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    APTITUDE: APTITUDE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HoshiTurf = api;
})(typeof window !== 'undefined' ? window : this);
