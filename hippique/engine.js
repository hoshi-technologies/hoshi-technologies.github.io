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
    { key: 'forme', label: 'Forme (musique)', weight: 24 },
    { key: 'regularite', label: 'Régularité carrière', weight: 12 },
    { key: 'classe', label: 'Classe (gains/course)', weight: 12 },
    { key: 'jockey', label: 'Jockey / driver', weight: 8 },
    { key: 'entraineur', label: 'Entraîneur', weight: 8 },
    { key: 'aptitude', label: 'Aptitude distance/hippodrome', weight: 8 },
    { key: 'handicap', label: 'Poids / recul / corde / ferrure', weight: 5 },
    { key: 'fraicheur', label: 'Fraîcheur (repos)', weight: 5 },
    { key: 'vitesse', label: 'Vitesse (réduction km, trot)', weight: 8 },
    { key: 'niveau', label: 'Niveau des courses récentes', weight: 5 },
    { key: 'mouvement', label: 'Mouvement des cotes', weight: 6 },
    { key: 'avis', label: "Avis de l'entraîneur", weight: 3 },
    { key: 'elo', label: 'Note de valeur (Elo)', weight: 6 },
  ];

  var DEFAULT_SETTINGS = {
    weights: CRITERIA.reduce(function (o, c) {
      o[c.key] = c.weight;
      return o;
    }, {}),
    marketWeight: 0.5, // part du marché (cotes) dans la probabilité finale
    marketPower: 1, // correctif favori-outsider : probabilités du marché ∝ (1/cote)^k
    temperature: 11, // dispersion : plus petit = favoris plus marqués
    placeDiscount: 0.8, // correctif Henery/Lo pour les places 2 et 3
    simulations: 20000, // simulations de l'arrivée (trios)
    seed: 20261101,
  };

  var APTITUDE = { '': null, inconnue: null, faible: 25, moyenne: 50, bonne: 75, excellente: 92 };

  function placesPayees(nPartants) {
    if (nPartants < 4) return 0;
    if (nPartants < 8) return 2;
    return 3;
  }

  /** Calcule les sous-notes de chaque partant (0-100, null si inconnu). */
  function computeSubScores(runners, discipline, race) {
    var isTrot = /trot/i.test(discipline || '');
    race = race || {};

    // Vitesse (trot) : meilleure réduction kilométrique récente, comparée au champ.
    var rk = runners.map((r) => num(r.rk));
    var rkKnown = rk.filter((x) => x !== null && x > 0);
    var rkMean = mean(rkKnown),
      rkStd = std(rkKnown) || 1;
    var allocRace = num(race.allocation);

    // Note Elo : comparée aux autres chevaux notés du champ.
    var elo = runners.map((r) => (num(r.ratingN) >= 1 ? num(r.rating) : null));
    var eloKnown = elo.filter((x) => x !== null);
    var eloMean = mean(eloKnown),
      eloStd = std(eloKnown) || 60;

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
      if (v !== null) return v;
      if (dists[i] !== null) return dists[i] - dMin;
      return num(r.poids); // saisie manuelle : colonne « Poids/Recul »
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
      if (s.aptitude === null) {
        // Aptitude automatique : réussite (top 3) à distance comparable et sur l'hippodrome.
        var aD = r.aptD,
          aH = r.aptH;
        var parts = [];
        if (aD && aD[1]) parts.push({ r: shrinkRate(aD[0], aD[1], 0.3, 3), w: aD[1] });
        if (aH && aH[1]) parts.push({ r: shrinkRate(aH[0], aH[1], 0.3, 3), w: aH[1] * 0.6 });
        if (parts.length) {
          var wsum = parts.reduce((a, b) => a + b.w, 0);
          var rate = parts.reduce((a, b) => a + b.r * b.w, 0) / wsum;
          s.aptitude = clamp(50 + (rate - 0.3) * 120, 0, 100);
        }
      }

      s.vitesse = isTrot && rk[i] !== null && rk[i] > 0 && rkKnown.length > 2 ? zToScore(-(rk[i] - rkMean) / rkStd) : null;

      var al = num(r.alloc);
      s.niveau = al && allocRace ? clamp(50 + 22 * Math.log(al / allocRace), 0, 100) : null;

      var cRef = num(r.coteRef),
        cNow = num(r.cote);
      s.mouvement = cRef > 1 && cNow > 1 ? clamp(50 + 30 * Math.log(cRef / cNow), 0, 100) : null;

      var av = r.avis;
      s.avis = av === 'POSITIF' ? 75 : av === 'NEGATIF' ? 25 : av === 'NEUTRE' ? 50 : null;

      // Elo : au moins 2 chevaux notés pour comparer ; confiance croissante avec le nombre de courses.
      if (elo[i] !== null && eloKnown.length >= 2) {
        var conf = Math.min(1, num(r.ratingN) / 4);
        s.elo = clamp(50 + (zToScore((elo[i] - eloMean) / eloStd) - 50) * conf, 0, 100);
      } else s.elo = null;

      var h = null;
      if (isTrot) {
        if (reculs[i] !== null) h = 55 - (reculs[i] / 25) * 12; // chaque 25 m de recul pénalise
        // Déferré des 4 pieds : souvent un signe d'objectif ; des 2 : léger mieux.
        if (r.deferre) h = (h === null ? 50 : h) + (/ANTERIEURS_POSTERIEURS|4/.test(r.deferre) ? 8 : 4);
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

  /** Groupe de réglages : le trot et le galop ne se jouent pas sur les mêmes critères. */
  function disciplineGroup(discipline) {
    return /trot/i.test(discipline || '') ? 'trot' : 'galop';
  }

  /**
   * Groupes de réglages d'une course, du plus précis au plus général :
   * discipline + type (handicap ou non), discipline, galop/trot.
   */
  function raceGroupKeys(race) {
    if (typeof race === 'string') race = { discipline: race };
    race = race || {};
    var d = race.discipline || '';
    var disc = /trot/i.test(d) ? 'trot' : /obstacle|haie|steeple|cross/i.test(d) ? 'obstacle' : 'plat';
    var type = /HANDICAP/i.test(race.categorie || '') ? 'hcp' : 'cond';
    return [disc + '-' + type, disc, disciplineGroup(d)];
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
    return { probs: filled.map((x) => x / total), inv: filled, overround: known.reduce((a, b) => a + b, 0) };
  }

  /**
   * Correctif du biais favori-outsider : le public surjoue les outsiders, donc
   * p ∝ (1/cote)^k avec k > 1 (k appris sur les résultats ; k = 1 : proportionnel).
   */
  function powerProbs(inv, k) {
    if (!k || k === 1) {
      var t = inv.reduce((a, b) => a + b, 0);
      return inv.map((x) => x / t);
    }
    var w = inv.map((x) => Math.pow(x, k));
    var tw = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / tw);
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

  function mergeSettings(userSettings) {
    var settings = Object.assign({}, DEFAULT_SETTINGS, userSettings || {});
    settings.weights = Object.assign({}, DEFAULT_SETTINGS.weights, (userSettings || {}).weights || {});
    return settings;
  }

  /**
   * Partie indépendante des réglages : partants retenus, sous-notes, marché.
   * (Séparée pour que le calibrage puisse tester des milliers de réglages vite.)
   */
  function prepareRace(race) {
    var runners = (race.runners || []).filter((r) => !r.nonPartant && (r.nom || r.num));
    if (runners.length < 2) return null;
    return {
      runners: runners,
      subs: computeSubScores(runners, race.discipline, race),
      market: marketProbs(runners),
    };
  }

  /** Vecteur de caractéristiques d'un partant pour le modèle appris. */
  function featureVector(prep, i) {
    var s = prep.subs[i].scores,
      x = [];
    for (var k = 0; k < CRITERIA.length; k++) {
      var v = s[CRITERIA[k].key];
      x.push(v === null || v === undefined ? 45 : v);
      x.push(v === null || v === undefined ? 1 : 0); // indicateur « inconnu »
    }
    var n = prep.runners.length;
    x.push(Math.log(prep.market ? Math.max(prep.market.probs[i], 1e-4) : 1 / n) + Math.log(n));
    x.push(prep.market ? 0 : 1);
    return x;
  }

  /** Modèle appris (logit conditionnel) : utilité linéaire des caractéristiques. */
  function learnedProbs(prep, L) {
    var n = prep.runners.length,
      u = [],
      uNoMk = [];
    for (var i = 0; i < n; i++) {
      var x = featureVector(prep, i),
        a = 0;
      for (var k = 0; k < x.length; k++) a += (L.beta[k] || 0) * ((x[k] - L.mean[k]) / (L.sd[k] || 1));
      u.push(a);
      var m = x.length - 2;
      uNoMk.push(a - (L.beta[m] || 0) * ((x[m] - L.mean[m]) / (L.sd[m] || 1)));
    }
    var soft = function (v) {
      var mx = Math.max.apply(null, v);
      var e = v.map((z) => Math.exp(z - mx));
      var t = e.reduce((p, q) => p + q, 0);
      return e.map((z) => z / t);
    };
    return { pWin: soft(u), pModel: soft(uNoMk) };
  }

  /** Scores pondérés et probabilités de victoire (modèle, marché, combinée). */
  function winProbs(prep, settings) {
    var totalW = CRITERIA.reduce((s, c) => s + (settings.weights[c.key] || 0), 0) || 1;
    var scores = [],
      conf = [];
    for (var i = 0; i < prep.runners.length; i++) {
      var s = prep.subs[i].scores,
        acc = 0,
        known = 0;
      for (var k = 0; k < CRITERIA.length; k++) {
        var w = settings.weights[CRITERIA[k].key] || 0;
        var v = s[CRITERIA[k].key];
        if (v === null || v === undefined) v = 45;
        else known += w;
        acc += w * v;
      }
      scores.push(acc / totalW);
      conf.push(known / totalW);
    }
    // Probabilité modèle : softmax des scores.
    var T = settings.temperature;
    var maxS = Math.max.apply(null, scores);
    var ex = scores.map((x) => Math.exp((x - maxS) / T));
    var exSum = ex.reduce((a, b) => a + b, 0);
    var pModel = ex.map((e) => e / exSum);
    // Combinaison log-linéaire avec le marché.
    var mk = prep.market;
    var alpha = mk ? clamp(settings.marketWeight, 0, 1) : 0;
    var mp = mk ? (mk.inv ? powerProbs(mk.inv, settings.marketPower || 1) : mk.probs) : null;
    var comb = pModel.map((p, j) => (mk ? Math.pow(p, 1 - alpha) * Math.pow(mp[j], alpha) : p));
    var cSum = comb.reduce((a, b) => a + b, 0);
    var out = { scores: scores, confidence: conf, pModel: pModel, pWin: comb.map((p) => p / cSum) };
    if (settings.learned) {
      var lp = learnedProbs(prep, settings.learned);
      out.pWin = lp.pWin;
      out.pModel = lp.pModel;
      out.learned = true;
    }
    return out;
  }

  /**
   * Probabilités exactes d'arriver 1er, 2e, 3e (Plackett-Luce : le 1er selon pWin,
   * les 2e et 3e selon pWin^λ, correctif de Henery/Lo pour les places d'honneur).
   */
  function positionProbs(pWin, lam) {
    var n = pWin.length;
    var a = pWin.map((p) => Math.pow(p, lam));
    var A = a.reduce((x, y) => x + y, 0);
    var p2 = new Array(n).fill(0),
      p3 = new Array(n).fill(0);
    for (var j = 0; j < n; j++) {
      var Aj = A - a[j];
      if (Aj <= 0) continue;
      for (var k = 0; k < n; k++) {
        if (k === j) continue;
        var pjk = (pWin[j] * a[k]) / Aj; // j 1er, k 2e
        p2[k] += pjk;
        var Ajk = Aj - a[k];
        if (Ajk <= 0) continue;
        for (var i = 0; i < n; i++) if (i !== j && i !== k) p3[i] += (pjk * a[i]) / Ajk;
      }
    }
    return { pos1: pWin.slice(), pos2: p2, pos3: p3 };
  }

  /** Analyse complète d'une course. */
  function analyzeRace(race, userSettings) {
    var settings = mergeSettings(userSettings);
    var prep = prepareRace(race);
    if (!prep) return { error: 'Il faut au moins 2 partants.', runners: [] };
    var runners = prep.runners,
      n = runners.length,
      mk = prep.market;

    var wp = winProbs(prep, settings);
    var pWin = wp.pWin;
    var pos = positionProbs(pWin, settings.placeDiscount);
    var sim = simulate(pWin, settings); // pour les trios
    var nPlaces = placesPayees(n);

    var results = runners.map(function (r, i) {
      return {
        runner: r,
        scores: prep.subs[i].scores,
        musique: prep.subs[i].musique,
        score: wp.scores[i],
        confidence: wp.confidence[i],
      };
    });

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
      x.pModel = wp.pModel[i];
      x.pMarket = mk ? mk.probs[i] : null;
      x.pWin = pWin[i];
      x.p2 = pos.pos2[i];
      x.p3 = pos.pos3[i];
      x.pTop2 = pWin[i] + pos.pos2[i];
      x.pTop3 = x.pTop2 + pos.pos3[i];
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
        coteRef: (p.dernierRapportReference && p.dernierRapportReference.rapport) || '',
        avis: p.avisEntraineur || '',
        deferre: /^DEFERRE/.test(p.deferre || '') ? p.deferre : '',
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Paris : cote placé estimée, Kelly
  // ---------------------------------------------------------------------------

  // Relation cote gagnant → rapport placé : log(rapport - 1) = a + b·log(cote - 1),
  // apprise sur les rapports définitifs (valeurs par défaut prudentes).
  var PLACE_ODDS_DEFAULT = { 2: { a: -0.75, b: 0.72 }, 3: { a: -1.1, b: 0.72 } };

  function estimatePlaceOdds(cote, nPlaces, coefs) {
    var c = num(cote);
    if (!c || c <= 1 || !nPlaces) return null;
    var k = (coefs && coefs[nPlaces]) || PLACE_ODDS_DEFAULT[nPlaces];
    var t = k.table;
    if (t && t.length >= 2) {
      // Interpolation en log(cote − 1) dans la table des rapports moyens observés.
      var lx = Math.log(c - 1);
      var L = function (i) {
        return Math.log(t[i][0] - 1);
      };
      var v;
      if (lx <= L(0)) {
        // Avant la 1re tranche : on suit la pente de la formule.
        v = 1 + (t[0][1] - 1) * Math.exp(k.b * (lx - L(0)));
      } else if (lx >= L(t.length - 1)) {
        v = 1 + (t[t.length - 1][1] - 1) * Math.exp(k.b * (lx - L(t.length - 1)));
      } else {
        for (var i = 1; i < t.length; i++)
          if (lx <= L(i)) {
            var w = (lx - L(i - 1)) / (L(i) - L(i - 1));
            v = t[i - 1][1] + w * (t[i][1] - t[i - 1][1]);
            break;
          }
      }
      return Math.max(1.1, v);
    }
    return Math.max(1.1, 1 + Math.exp(k.a + k.b * Math.log(c - 1)) * (k.smear || 1));
  }

  /** Fraction de Kelly : part de la bankroll à miser pour une probabilité p à la cote o. */
  function kelly(p, o) {
    if (!p || !o || o <= 1) return 0;
    return Math.max(0, (p * o - 1) / (o - 1));
  }

  /** Choisit les réglages calibrés adaptés à la discipline. */
  function settingsFor(calibration, race) {
    if (!calibration || calibration.status !== 'ok') return null;
    var keys = raceGroupKeys(race),
      g = null;
    for (var i = 0; i < keys.length && !g; i++) g = calibration.groups && calibration.groups[keys[i]];
    var s = (g && g.settings) || calibration.settings;
    if (!s) return null;
    var out = mergeSettings(s);
    if (g && g.useLearned && g.learned) out.learned = g.learned;
    return out;
  }

  /**
   * Stratégie de paris validée par la simulation (ROI positif même après retrait de deux
   * erreurs-types), ou null. C'est la seule condition pour conseiller une vraie mise.
   */
  function validatedStrategy(calibration) {
    var bt = calibration && calibration.backtest;
    if (!bt) return null;
    var ok = bt.strategies
      .filter((x) => x.validated && x.id.indexOf('val_') === 0)
      .sort((a, b) => b.roi - a.roi);
    return ok[0] || null;
  }

  /**
   * Chances « réelles » d'être placé : le modèle est un peu trop sûr de lui pour ses meilleurs
   * chevaux (annoncé 84 % → observé 73 %, annoncé 94 % → observé 84 % sur les courses de
   * contrôle). On corrige par interpolation sur la table de fiabilité du calibrage.
   */
  function realPlace(p, calibration) {
    var rel = calibration && calibration.reliability;
    if (p == null || !rel) return p;
    var pts = rel.filter((b) => b.n >= 50 && b.predicted != null && b.observed != null).map((b) => [b.predicted, b.observed]);
    if (pts.length < 3) return p;
    pts.unshift([0, 0]);
    pts.push([1, Math.max(pts[pts.length - 1][1], Math.min(1, pts[pts.length - 1][1] + (1 - pts[pts.length - 1][0]) * 0.8))]);
    for (var k = 1; k < pts.length; k++)
      if (p <= pts[k][0]) {
        var a = pts[k - 1],
          b = pts[k];
        return clamp(a[1] + ((b[1] - a[1]) * (p - a[0])) / Math.max(1e-9, b[0] - a[0]), 0, 1);
      }
    return pts[pts.length - 1][1];
  }

  /** Paris « valeur » d'une course analysée : probabilité × cote ≥ seuil. */
  function valueBets(analysis, calibration, opts) {
    opts = opts || {};
    var edge = opts.minEdge || 1.15,
      types = opts.types || 'gp',
      out = [];
    if (!analysis || analysis.error || !analysis.market) return out;
    var coefs = calibration && calibration.placeOdds;
    analysis.runners.forEach(function (x) {
      if (x.confidence < 0.5) return;
      var cote = num(x.runner.cote);
      if (!(cote > 1)) return;
      if (types.indexOf('g') >= 0 && x.pWin >= 0.03 && x.pWin * cote >= edge)
        out.push({ x: x, type: 'g', p: x.pWin, o: cote, ev: x.pWin * cote, est: false });
      if (types.indexOf('p') >= 0 && analysis.placesPayees) {
        var oP = estimatePlaceOdds(cote, analysis.placesPayees, coefs);
        if (oP && x.pPlace * oP >= edge) out.push({ x: x, type: 'p', p: x.pPlace, o: oP, ev: x.pPlace * oP, est: true });
      }
    });
    out.forEach((b) => (b.kelly = kelly(b.p, b.o)));
    return out.sort((a, b) => b.ev - a.ev);
  }

  // ---------------------------------------------------------------------------
  // Choix Hoshi : le cheval que le modèle estime nettement plus que la cote
  // ---------------------------------------------------------------------------

  /**
   * Règles du « Choix Hoshi ». Au lieu de prendre le cheval le plus probable (souvent le
   * favori, mal payé), on prend celui dont nos chances dépassent le plus celles que lui
   * donne la cote (ratio modèle / marché), parmi ceux qui ont assez de chances.
   * Réglées sur l'historique (nov. 2026, 1 500 courses jamais vues par le modèle) :
   *  - gagnant : chances de gagner ≥ 12 % et ratio ≥ 1,2 ;
   *  - placé   : chances d'être placé ≥ 50 % et ratio ≥ 1,2.
   * Pas de cheval qui remplit les conditions → pas de Choix Hoshi dans la course.
   */
  var CHOICE_RULES = {
    g: { pMin: 0.12, ratio: 1.2 },
    p: { pMin: 0.5, ratio: 1.2 },
  };

  /** Indice du Choix Hoshi (ou -1) à partir des tableaux de probabilités. */
  function choiceIndex(pWin, pPlace, pMarket, type, rules) {
    var r = (rules || CHOICE_RULES)[type];
    if (!r || !pMarket) return -1;
    var best = -1,
      bestR = 0;
    for (var i = 0; i < pWin.length; i++) {
      var pm = pMarket[i];
      if (!(pm > 0)) continue;
      var p = type === 'g' ? pWin[i] : pPlace ? pPlace[i] : null;
      if (p == null || p < r.pMin) continue;
      var ratio = pWin[i] / pm;
      if (ratio >= r.ratio && ratio > bestR) (bestR = ratio), (best = i);
    }
    return best;
  }

  /**
   * Partants avec la cote de RÉFÉRENCE du matin à la place de la cote du moment
   * (la cote du moment est gardée dans coteLive).
   *
   * Pourquoi : face aux cotes du matin, les chevaux que notre modèle préfère perdent moins que
   * les autres (le marché finit souvent par leur donner raison) ; face aux cotes de la dernière
   * minute, c'est l'inverse : ils perdent PLUS (−36 % contre −26 % en moyenne, 26 000 chevaux).
   * Le Choix Hoshi doit donc se décider sur les cotes du matin, comme dans l'étude qui l'a validé.
   */
  function morningRunners(runners) {
    return (runners || []).map(function (r) {
      return num(r.coteRef) > 1 ? Object.assign({}, r, { cote: r.coteRef, coteLive: r.cote }) : r;
    });
  }

  /** Choix Hoshi d'une course, décidé sur les cotes du matin (voir morningRunners). */
  function hoshiChoiceMorning(race, settings, rules) {
    var a = analyzeRace(Object.assign({}, race, { runners: morningRunners(race.runners) }), Object.assign({}, settings || {}, { simulations: 0 }));
    return hoshiChoice(a, rules);
  }

  // ---------------------------------------------------------------------------
  // Outsiders Hoshi : chevaux que le modèle estime au moins 2,5 fois plus que la cote du matin
  // ---------------------------------------------------------------------------

  /**
   * Étude sur 142 000 courses (2017-2026, modèle réentraîné chaque année sur les deux années
   * précédentes, jamais testé sur des courses vues, vrais rapports PMU) : en France, les chevaux
   * dont nos chances dépassent 2,5 fois celles de la cote du matin ont rapporté, pour 1 € gagnant
   * + 1 € placé, +70 % des mises en 2017-2022 et +96 % en 2023-2026. Ce sont surtout de gros
   * outsiders : on gagne rarement (4 à 6 % des paris), avec des séries de plus de 100 paris
   * sans victoire. Le modèle (logit conditionnel) est réentraîné chaque jour par le calibrage.
   */
  var OUTSIDER_RATIO = 2.5;
  // RETIRÉ le 13/11/2026 : l'avantage mesuré venait d'un défaut des données historiques. 9 Outsiders
  // sur 10 de l'étude étaient des chevaux SANS cote de référence archivée (leur cote finale avait été
  // utilisée à la place, ce qui fausse la comparaison). Sur les courses aux données complètes
  // (100 000 courses), la méthode perd : −53 % en 2017-2022, −26 % en 2023-2026.
  var OUTSIDER_ENABLED = false;
  // Disciplines retenues : le trot seul est prouvé sur les deux périodes (+69 % puis +98 %,
  // 4 372 paris) ; le galop est positif mais sur trop peu de paris pour être prouvé.
  var OUTSIDER_DISCIPLINES = ['trot'];
  function outsiderDiscipline(discipline, L) {
    var list = (L && L.disciplines) || OUTSIDER_DISCIPLINES;
    var d = String(discipline || '').toLowerCase();
    return list.some((x) => d.indexOf(x) >= 0);
  }

  /**
   * Outsiders d'une course : [{ runner, p, pPlace, pMarket, ratio, cote (matin), coteLive }],
   * à partir du modèle `L` (calibration.outsider) et des cotes de référence du matin.
   */
  function outsiderPicks(race, L, opts) {
    opts = opts || {};
    if (!L || !L.beta) return [];
    if (!OUTSIDER_ENABLED && !opts.force) return [];
    if (!opts.allDisciplines && !outsiderDiscipline(race.discipline, L)) return [];
    var prep = prepareRace(Object.assign({}, race, { runners: morningRunners(race.runners) }));
    if (!prep || !prep.market) return [];
    var pw = learnedProbs(prep, L).pWin;
    var np = placesPayees(prep.runners.length);
    var pos = positionProbs(pw, L.placeDiscount || 0.7);
    var thr = opts.ratio || L.threshold || OUTSIDER_RATIO;
    var out = [];
    prep.runners.forEach(function (r, i) {
      var pm = prep.market.probs[i];
      if (!(num(r.cote) > 1) || !(pm > 0)) return;
      var ratio = pw[i] / pm;
      if (ratio < thr) return;
      out.push({
        runner: r,
        p: pw[i],
        pPlace: np ? pos.pos1[i] + pos.pos2[i] + (np === 3 ? pos.pos3[i] : 0) : null,
        pMarket: pm,
        ratio: ratio,
        cote: num(r.cote),
        coteLive: num(r.coteLive) || num(r.cote),
      });
    });
    return out.sort((a, b) => b.ratio - a.ratio);
  }

  /**
   * Choix Hoshi d'une course analysée : { g, p }, chacun { x, ratio, p, cote } ou null.
   * `x` est l'élément de analysis.runners.
   */
  function hoshiChoice(analysis, rules) {
    var out = { g: null, p: null };
    if (!analysis || analysis.error || !analysis.market) return out;
    var R = analysis.runners;
    var pw = R.map((x) => x.pWin),
      pl = analysis.placesPayees ? R.map((x) => x.pPlace) : null,
      pm = R.map((x) => (num(x.runner.cote) > 1 ? x.pMarket : null));
    ['g', 'p'].forEach(function (t) {
      var i = choiceIndex(pw, pl, pm, t, rules);
      if (i < 0) return;
      out[t] = { x: R[i], ratio: pw[i] / pm[i], p: t === 'g' ? pw[i] : pl[i], cote: num(R[i].runner.cote) };
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Quinté+
  // ---------------------------------------------------------------------------

  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    var r = 1;
    for (var i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  function popcount(m) {
    var c = 0;
    while (m) (m &= m - 1), c++;
    return c;
  }

  /**
   * Probabilité Plackett-Luce que les |S| premiers soient exactement les chevaux de S
   * (dans n'importe quel ordre) : le 1er selon p, les suivants selon a = p^λ.
   */
  function plSetProb(p, a, S) {
    var A = 0;
    for (var i = 0; i < a.length; i++) A += a[i];
    var k = S.length;
    var used = new Array(k).fill(false);
    var rec = function (depth, rest) {
      if (depth === k) return 1;
      var tot = 0;
      for (var j = 0; j < k; j++) {
        if (used[j]) continue;
        var x = S[j];
        var pr = depth === 0 ? p[x] : a[x] / rest;
        if (!(pr > 0)) continue;
        used[j] = true;
        tot += pr * rec(depth + 1, rest - a[x]);
        used[j] = false;
      }
      return tot;
    };
    return rec(0, A);
  }

  /**
   * Rapports du Quinté+ (pour 1 €) en fonction de la popularité de la combinaison :
   * log(rapport) = a + b × log(P_marché), où P_marché est la probabilité que le public
   * (les cotes du matin) donne à la combinaison gagnante. Réglé sur les rapports réels du PMU
   * (31 Quintés d'août à novembre 2026, corrélation −0,80 à −0,84).
   *   des : désordre (P des 5 premiers) ; b4 : bonus 4 sur 5 (P des 5 premiers) ;
   *   b3  : bonus 3 (P des 3 premiers).
   */
  var QUINTE_PAYOUTS = {
    des: { a: -0.241, b: -0.814 },
    b4: { a: -2.002, b: -0.531 },
    b3: { a: -2.167, b: -0.69 },
  };

  /**
   * Quinté+ « valeur » : parmi les combinaisons de 5 chevaux pris dans nos 10 meilleurs,
   * celle qui rapporte le plus en moyenne (espérance pour 1 €), en tenant compte de nos
   * chances ET du rapport attendu (une combinaison boudée par le public paie plus).
   * Renvoie { best, base, candidates } : best = combinaison valeur, base = nos 5 plus probables.
   * Chaque combinaison : { idx, ev, p: { des, b4, b3 }, pay: { des, b4, b3 } } (pay : rapport
   * moyen attendu quand on touche). Simulation de l'arrivée selon nos probabilités.
   */
  function quinteValue(pWin, pMarket, opts) {
    opts = opts || {};
    var n = pWin.length;
    if (n < 6 || !pMarket) return null;
    var lam = opts.placeDiscount || 0.8,
      N = opts.simulations || 20000,
      rand = rng(opts.seed || 20261105),
      C = opts.payouts || QUINTE_PAYOUTS,
      K = Math.min(n, opts.candidates || 10);
    var pm = pMarket.map((x) => (x > 0 ? x : 1e-4));
    var tm = pm.reduce((s, x) => s + x, 0);
    pm = pm.map((x) => x / tm);
    var am = pm.map((x) => Math.pow(x, lam));
    var aw = pWin.map((x) => Math.pow(x, lam));
    var cache5 = new Map(),
      cache3 = new Map();
    var idxOf = function (m) {
      var r = [];
      for (var i = 0; i < n; i++) if (m & (1 << i)) r.push(i);
      return r;
    };
    var pay = function (t, m, cache) {
      var v = cache.get(m);
      if (v === undefined) {
        var pr = Math.max(plSetProb(pm, am, idxOf(m)), 1e-9);
        v = [Math.exp(C.des.a + C.des.b * Math.log(pr)), Math.exp(C.b4.a + C.b4.b * Math.log(pr)), Math.exp(C.b3.a + C.b3.b * Math.log(pr))];
        cache.set(m, v);
      }
      return v[t];
    };
    // Arrivées simulées (5 premiers) selon nos probabilités.
    var m5s = new Int32Array(N),
      m3s = new Int32Array(N),
      top5 = new Float64Array(n),
      used = new Uint8Array(n);
    for (var k = 0; k < N; k++) {
      used.fill(0);
      var m = 0;
      for (var pos = 0; pos < 5; pos++) {
        var w = pos === 0 ? pWin : aw,
          tot = 0,
          i;
        for (i = 0; i < n; i++) if (!used[i]) tot += w[i];
        var x = rand() * tot,
          j = -1;
        for (i = 0; i < n; i++) {
          if (used[i]) continue;
          x -= w[i];
          j = i;
          if (x <= 0) break;
        }
        used[j] = 1;
        m |= 1 << j;
        top5[j]++;
        if (pos === 2) m3s[k] = m;
      }
      m5s[k] = m;
    }
    var order = Array.from(top5, (c, i) => i).sort((a, b) => top5[b] - top5[a] || pWin[b] - pWin[a]);
    var pool = order.slice(0, K);
    var evalSet = function (idx) {
      var S = idx.reduce((mm, i) => mm | (1 << i), 0);
      var h = { des: 0, b4: 0, b3: 0 },
        g = { des: 0, b4: 0, b3: 0 };
      for (var k2 = 0; k2 < N; k2++) {
        var a5 = m5s[k2];
        if (a5 === S) (h.des++, (g.des += pay(0, a5, cache5)));
        else if (popcount(a5 & S) === 4) (h.b4++, (g.b4 += pay(1, a5, cache5)));
        else if ((m3s[k2] & ~S) === 0) (h.b3++, (g.b3 += pay(2, m3s[k2], cache3)));
      }
      return {
        idx: idx.slice().sort((a, b) => top5[b] - top5[a]),
        ev: (g.des + g.b4 + g.b3) / N,
        p: { des: h.des / N, b4: h.b4 / N, b3: h.b3 / N },
        pay: { des: h.des ? g.des / h.des : 0, b4: h.b4 ? g.b4 / h.b4 : 0, b3: h.b3 ? g.b3 / h.b3 : 0 },
      };
    };
    var cands = [];
    var pick = function (start, chosen) {
      if (chosen.length === 5) return void cands.push(evalSet(chosen));
      for (var i = start; i < pool.length; i++) pick(i + 1, chosen.concat([pool[i]]));
    };
    pick(0, []);
    cands.sort((a, b) => b.ev - a.ev);
    var base = evalSet(opts.base && opts.base.length === 5 ? opts.base : order.slice(0, 5));
    return { best: cands[0], base: base, candidates: cands.slice(0, 5), pTop5: Array.from(top5, (c) => c / N) };
  }

  /**
   * Analyse Quinté+ par simulation de l'arrivée (Plackett-Luce, correctif des places) :
   * chances de chaque cheval de finir dans les 5 premiers, nos 5 chevaux, chances du
   * désordre / bonus 4 / bonus 3, et formules combinées de 5 à 8 chevaux.
   */
  function quinteAnalysis(pWin, opts) {
    opts = opts || {};
    var n = pWin.length;
    if (n < 6) return null;
    var N = opts.simulations || 30000,
      lam = opts.placeDiscount || 0.8,
      rand = rng(opts.seed || 20261103);
    var adj = pWin.map((p) => Math.pow(p, lam));
    var used = new Uint8Array(n),
      top5 = new Float64Array(n);
    var sims = new Int32Array(N * 5);
    for (var k = 0; k < N; k++) {
      used.fill(0);
      for (var pos = 0; pos < 5; pos++) {
        var w = pos === 0 ? pWin : adj,
          tot = 0,
          i;
        for (i = 0; i < n; i++) if (!used[i]) tot += w[i];
        var x = rand() * tot,
          j = -1;
        for (i = 0; i < n; i++) {
          if (used[i]) continue;
          x -= w[i];
          j = i;
          if (x <= 0) break;
        }
        used[j] = 1;
        sims[k * 5 + pos] = j;
        top5[j]++;
      }
    }
    var pTop5 = Array.from(top5, (c) => c / N);
    var byTop5 = pTop5.map((_, i) => i).sort((a, b) => pTop5[b] - pTop5[a] || pWin[b] - pWin[a]);
    var picks = byTop5.slice(0, 5);
    var ordre = picks.slice().sort((a, b) => pWin[b] - pWin[a]);
    var maskOf = (idx) => idx.reduce((m, i) => m | (1 << i), 0);
    var sets = [];
    for (var m = 5; m <= Math.min(8, n); m++) sets.push({ n: m, idx: byTop5.slice(0, m), mask: maskOf(byTop5.slice(0, m)) });
    var S5 = maskOf(picks);
    var c = { ordre: 0, desordre: 0, bonus4: 0, bonus3: 0 };
    var cs = sets.map(() => ({ d: 0, b4: 0, b3: 0 }));
    for (k = 0; k < N; k++) {
      var o = k * 5;
      var m3 = (1 << sims[o]) | (1 << sims[o + 1]) | (1 << sims[o + 2]);
      var m4 = m3 | (1 << sims[o + 3]);
      var m5 = m4 | (1 << sims[o + 4]);
      if (m5 === S5) {
        c.desordre++;
        if (sims[o] === ordre[0] && sims[o + 1] === ordre[1] && sims[o + 2] === ordre[2] && sims[o + 3] === ordre[3] && sims[o + 4] === ordre[4]) c.ordre++;
      }
      // Bonus 4 sur 5 : au moins 4 de nos chevaux parmi les 5 premiers (règle PMU actuelle).
      if (popcount(m5 & S5) >= 4) c.bonus4++;
      if ((m3 & ~S5) === 0) c.bonus3++;
      for (var q = 0; q < sets.length; q++) {
        var S = sets[q].mask;
        if ((m5 & ~S) === 0) cs[q].d++;
        if (popcount(m5 & S) >= 4) cs[q].b4++;
        if ((m3 & ~S) === 0) cs[q].b3++;
      }
    }
    return {
      pTop5: pTop5,
      order: byTop5,
      picks: picks,
      ordre: ordre,
      p: { ordre: c.ordre / N, desordre: c.desordre / N, bonus4: c.bonus4 / N, bonus3: c.bonus3 / N },
      combines: sets.map((st, q) => ({
        n: st.n,
        idx: st.idx,
        combos: comb(st.n, 5),
        pDesordre: cs[q].d / N,
        pBonus4: cs[q].b4 / N,
        pBonus3: cs[q].b3 / N,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Paris combinés (couplé, 2 sur 4 / duo, trio, quarté / quatrio)
  // ---------------------------------------------------------------------------

  // size : chevaux par combinaison ; depth : places concernées ; need : bons chevaux requis.
  var COMBO_BETS = [
    { key: 'couple_g', label: 'Couplé gagnant', rule: 'les 2 premiers, dans n\'importe quel ordre', size: 2, depth: 2, need: 2 },
    { key: 'couple_p', label: 'Couplé placé', rule: '2 chevaux parmi les 3 premiers', size: 2, depth: 3, need: 2 },
    { key: 'duo4', label: '2 sur 4 / Duo 4', rule: '2 chevaux parmi les 4 premiers', size: 2, depth: 4, need: 2 },
    { key: 'trio', label: 'Trio', rule: 'les 3 premiers, dans n\'importe quel ordre', size: 3, depth: 3, need: 3 },
    { key: 'quatrio', label: 'Quarté désordre / Quatrio', rule: 'les 4 premiers, dans n\'importe quel ordre', size: 4, depth: 4, need: 4 },
  ];

  /**
   * Chances des paris combinés par simulation de l'arrivée (même modèle que les places).
   * Pour chaque pari : les combinaisons les plus probables, et des formules « champ réduit »
   * avec nos k meilleurs chevaux (nombre de combinaisons, chances d'avoir au moins une
   * combinaison gagnante).
   */
  function comboAnalysis(pWin, opts) {
    opts = opts || {};
    var n = pWin.length;
    if (n < 4) return null;
    var N = opts.simulations || 30000,
      lam = opts.placeDiscount || 0.8,
      rand = rng(opts.seed || 20261104);
    var depthMax = Math.min(5, n);
    var adj = pWin.map((p) => Math.pow(p, lam));
    var used = new Uint8Array(n);
    var top = [];
    for (var d = 0; d < depthMax; d++) top.push(new Float64Array(n));
    var bets = COMBO_BETS.filter((b) => b.depth <= n);
    var counts = bets.map(() => ({}));
    var firstK = new Int32Array(depthMax);
    // Formules : nos k meilleurs chevaux (par chances d'être dans les « depth » premiers).
    var sims = new Int32Array(N * depthMax);
    for (var k = 0; k < N; k++) {
      used.fill(0);
      for (var pos = 0; pos < depthMax; pos++) {
        var w = pos === 0 ? pWin : adj,
          tot = 0,
          i;
        for (i = 0; i < n; i++) if (!used[i]) tot += w[i];
        var x = rand() * tot,
          j = -1;
        for (i = 0; i < n; i++) {
          if (used[i]) continue;
          x -= w[i];
          j = i;
          if (x <= 0) break;
        }
        used[j] = 1;
        firstK[pos] = j;
        sims[k * depthMax + pos] = j;
        for (var dd = pos; dd < depthMax; dd++) top[dd][j]++;
      }
      // Combinaisons gagnantes de chaque pari pour cette arrivée
      bets.forEach(function (b, q) {
        var arr = Array.prototype.slice.call(firstK, 0, b.depth).sort((u, v) => u - v);
        var C = counts[q];
        if (b.size === b.depth) {
          var key = arr.join('-');
          C[key] = (C[key] || 0) + 1;
        } else {
          // toutes les sous-combinaisons de taille « size » parmi les « depth » premiers
          (function rec(start, acc) {
            if (acc.length === b.size) {
              var kk = acc.join('-');
              C[kk] = (C[kk] || 0) + 1;
              return;
            }
            for (var t = start; t < arr.length; t++) rec(t + 1, acc.concat(arr[t]));
          })(0, []);
        }
      });
    }
    return bets.map(function (b, q) {
      var pTop = Array.from(top[b.depth - 1], (c) => c / N);
      var order = pTop.map((_, i) => i).sort((u, v) => pTop[v] - pTop[u] || pWin[v] - pWin[u]);
      var best = Object.keys(counts[q])
        .map((key) => ({ idx: key.split('-').map(Number), p: counts[q][key] / N }))
        .sort((u, v) => v.p - u.p)
        .slice(0, 5);
      var formulas = [];
      for (var kk = b.size; kk <= Math.min(n, b.size + 4); kk++) {
        var set = order.slice(0, kk);
        var inSet = new Uint8Array(n);
        set.forEach((i) => (inSet[i] = 1));
        var ok = 0;
        for (var s2 = 0; s2 < N; s2++) {
          var hits = 0;
          for (var t = 0; t < b.depth; t++) if (inSet[sims[s2 * depthMax + t]]) hits++;
          if (hits >= b.need) ok++;
        }
        formulas.push({ k: kk, idx: set, combos: comb(kk, b.size), p: ok / N });
      }
      return { key: b.key, label: b.label, rule: b.rule, size: b.size, depth: b.depth, best: best, formulas: formulas };
    });
  }

  /** Taux de victoire (%) lissé d'un jockey/entraîneur à partir de [courses, victoires, places]. */
  function statRate(st) {
    if (!st || st[0] < 3) return null;
    return ((st[1] + 0.08 * 10) / (st[0] + 10)) * 100;
  }

  var api = {
    statRate: statRate,
    quinteAnalysis: quinteAnalysis,
    comboAnalysis: comboAnalysis,
    COMBO_BETS: COMBO_BETS,
    comb: comb,
    plSetProb: plSetProb,
    quinteValue: quinteValue,
    QUINTE_PAYOUTS: QUINTE_PAYOUTS,
    validatedStrategy: validatedStrategy,
    valueBets: valueBets,
    realPlace: realPlace,
    CHOICE_RULES: CHOICE_RULES,
    choiceIndex: choiceIndex,
    hoshiChoice: hoshiChoice,
    morningRunners: morningRunners,
    hoshiChoiceMorning: hoshiChoiceMorning,
    OUTSIDER_RATIO: OUTSIDER_RATIO,
    OUTSIDER_ENABLED: OUTSIDER_ENABLED,
    outsiderPicks: outsiderPicks,
    OUTSIDER_DISCIPLINES: OUTSIDER_DISCIPLINES,
    outsiderDiscipline: outsiderDiscipline,
    featureVector: featureVector,
    learnedProbs: learnedProbs,
    disciplineGroup: disciplineGroup,
    raceGroupKeys: raceGroupKeys,
    powerProbs: powerProbs,
    estimatePlaceOdds: estimatePlaceOdds,
    kelly: kelly,
    settingsFor: settingsFor,
    parseMusique: parseMusique,
    musiqueStats: musiqueStats,
    analyzeRace: analyzeRace,
    prepareRace: prepareRace,
    winProbs: winProbs,
    positionProbs: positionProbs,
    mergeSettings: mergeSettings,
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
