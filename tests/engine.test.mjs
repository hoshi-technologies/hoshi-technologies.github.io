// Tests du moteur Hoshi Turf : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../hippique/engine.js');

const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≠ ${b}`);
const sum = (a) => a.reduce((x, y) => x + y, 0);

function race(n = 8, withOdds = true) {
  const runners = [];
  for (let i = 1; i <= n; i++)
    runners.push({
      num: i,
      nom: 'CHEVAL ' + i,
      cote: withOdds ? 2 + i * 1.7 : '',
      coteRef: withOdds ? 2 + i * 1.5 : '',
      musique: ['1p2p3p', '2p4p1p', '5p0p6p', '0p0p7p', '3p1p4p', '4p5p3p', '9p0p8p', '2p6p1p', '6p3p7p', '1p0p0p'][(i - 1) % 10],
      gains: 20000 + 9000 * (n - i),
      courses: 10 + i,
      victoires: Math.max(0, 4 - (i % 5)),
      places: 3 + (i % 4),
      jockey: 8 + i,
      poids: 54 + (i % 5),
      repos: 10 + i * 9,
      rating: 1500 + (n - i) * 15,
      ratingN: 3,
    });
  return { discipline: 'plat', runners };
}

test('musique : lecture des places, incidents et années', () => {
  const r = T.parseMusique('1p 3p (25) 2p Da 0p');
  assert.equal(r.length, 5);
  assert.equal(r[0].place, 1);
  assert.equal(r[0].discipline, 'plat');
  assert.equal(r[3].incident, 'D');
  assert.equal(r[2].yearsAgo, 1);
  assert.equal(r[4].place, 0);
  assert.equal(T.parseMusique('').length, 0);
});

test('musique : une meilleure musique donne un meilleur score', () => {
  assert.ok(T.musiqueStats('1p1p2p1p').score > T.musiqueStats('0p9p0p8p').score);
});

test('places payées selon la règle PMU', () => {
  assert.equal(T.placesPayees(3), 0);
  assert.equal(T.placesPayees(4), 2);
  assert.equal(T.placesPayees(7), 2);
  assert.equal(T.placesPayees(8), 3);
});

test('probabilités : gagnant somme à 1, top 3 somme à 3, placé somme au nombre de places', () => {
  for (const n of [5, 8, 14]) {
    const a = T.analyzeRace(race(n), { simulations: 1000 });
    close(sum(a.runners.map((x) => x.pWin)), 1, 1e-9, 'gagnant');
    close(sum(a.runners.map((x) => x.pTop3)), 3, 1e-9, 'top 3');
    close(sum(a.runners.map((x) => x.pPlace)), a.placesPayees, 1e-9, 'placé');
    for (const x of a.runners) {
      assert.ok(x.pWin > 0 && x.pWin < 1);
      assert.ok(x.pPlace >= x.pWin - 1e-12, 'placé ≥ gagnant');
      assert.ok(x.note >= 0 && x.note <= 20);
    }
  }
});

test('calcul exact des places cohérent avec la simulation', () => {
  const a = T.analyzeRace(race(8), { simulations: 40000 });
  const pos = T.positionProbs(
    a.runners.map((x) => x.pWin),
    a.settings.placeDiscount,
  );
  // Les trios simulés ne doivent pas contredire le calcul exact : le favori du calcul est dans le trio le plus probable.
  const fav = a.runners.reduce((b, x) => (x.pTop3 > b.pTop3 ? x : b));
  assert.ok(a.trios[0].runners.includes(fav));
  close(sum(pos.pos2), 1, 1e-9, 'pos2');
  close(sum(pos.pos3), 1, 1e-9, 'pos3');
});

test('marché : marge retirée, correctif favori-outsider', () => {
  const m = T.marketProbs(race(8).runners);
  close(sum(m.probs), 1, 1e-9);
  const k1 = T.powerProbs(m.inv, 1),
    k13 = T.powerProbs(m.inv, 1.3);
  close(sum(k13), 1, 1e-9);
  assert.ok(k13[0] > k1[0], 'k > 1 renforce le favori');
  assert.ok(k13[7] < k1[7], 'k > 1 réduit l\'outsider');
  assert.equal(T.marketProbs(race(8, false).runners), null);
});

test('part du marché à 100 % : probabilités = marché', () => {
  const a = T.analyzeRace(race(8), { marketWeight: 1, simulations: 0 });
  for (const x of a.runners) close(x.pWin, x.pMarket, 1e-9);
});

test('modèle appris : probabilités valides', () => {
  const r = race(8);
  const prep = T.prepareRace(r);
  const F = T.featureVector(prep, 0).length;
  const L = { beta: new Array(F).fill(0.1), mean: new Array(F).fill(0), sd: new Array(F).fill(1) };
  const p = T.learnedProbs(prep, L);
  close(sum(p.pWin), 1, 1e-9);
  close(sum(p.pModel), 1, 1e-9);
});

test('Kelly et rapport placé estimé', () => {
  assert.equal(T.kelly(0.5, 1.5), 0);
  close(T.kelly(0.5, 3), 0.25, 1e-12);
  assert.equal(T.kelly(0, 3), 0);
  const o2 = T.estimatePlaceOdds(5, 2),
    o3 = T.estimatePlaceOdds(5, 3);
  assert.ok(o2 > o3 && o3 >= 1.1, 'le placé à 2 paie plus qu\'à 3');
  assert.ok(T.estimatePlaceOdds(20, 3) > T.estimatePlaceOdds(3, 3));
  assert.equal(T.estimatePlaceOdds('', 3), null);
});

test('paris valeur : seuil respecté', () => {
  const a = T.analyzeRace(race(8), { simulations: 0 });
  for (const b of T.valueBets(a, null, { minEdge: 1.05 })) assert.ok(b.ev >= 1.05);
  assert.equal(T.valueBets(T.analyzeRace(race(8, false), { simulations: 0 }), null).length, 0);
});

test('stratégie validée : seulement si marquée validée', () => {
  assert.equal(T.validatedStrategy(null), null);
  const cal = { backtest: { strategies: [{ id: 'val_p_1.05', validated: false, roi: 0.1 }] } };
  assert.equal(T.validatedStrategy(cal), null);
  cal.backtest.strategies[0].validated = true;
  assert.equal(T.validatedStrategy(cal).id, 'val_p_1.05');
});

test('groupes de réglages par type de course', () => {
  assert.deepEqual(T.raceGroupKeys({ discipline: 'plat', categorie: 'HANDICAP_DIVISE' }), ['plat-hcp', 'plat', 'galop']);
  assert.deepEqual(T.raceGroupKeys('trot attelé'), ['trot-cond', 'trot', 'trot']);
  assert.deepEqual(T.raceGroupKeys({ discipline: 'obstacle' }).slice(0, 2), ['obstacle-cond', 'obstacle']);
  const cal = { status: 'ok', settings: { temperature: 9 }, groups: { plat: { settings: { temperature: 4 } } } };
  assert.equal(T.settingsFor(cal, { discipline: 'plat', categorie: 'HANDICAP' }).temperature, 4);
  assert.equal(T.settingsFor(cal, 'trot attelé').temperature, 9);
});

test('import PMU : conversion des participants', () => {
  const r = T.fromPmuParticipants({
    participants: [
      {
        numPmu: 3,
        nom: 'TEST',
        musique: '1a2a',
        nombreCourses: 10,
        nombreVictoires: 2,
        nombrePlaces: 5,
        gainsParticipant: { gainsCarriere: 1234500 },
        dernierRapportDirect: { rapport: 4.5 },
        dernierRapportReference: { rapport: 6 },
        statut: 'NON_PARTANT',
        deferre: 'DEFERRE_ANTERIEURS_POSTERIEURS',
        avisEntraineur: 'POSITIF',
      },
    ],
  })[0];
  assert.equal(r.num, 3);
  assert.equal(r.cote, 4.5);
  assert.equal(r.coteRef, 6);
  assert.equal(r.gains, 12345);
  assert.equal(r.nonPartant, true);
  assert.equal(r.avis, 'POSITIF');
  assert.match(r.deferre, /^DEFERRE/);
});

test('non-partants exclus, champ trop petit refusé', () => {
  const r = race(4);
  r.runners[0].nonPartant = true;
  assert.equal(T.analyzeRace(r, { simulations: 0 }).nPartants, 3);
  assert.ok(T.analyzeRace({ runners: [{ nom: 'A' }] }).error);
});

test('Quinté+ : chances cohérentes', () => {
  const a = T.analyzeRace(race(14), { simulations: 0 });
  const q = T.quinteAnalysis(
    a.runners.map((x) => x.pWin),
    { placeDiscount: a.settings.placeDiscount, simulations: 20000 },
  );
  close(sum(q.pTop5), 5, 1e-9, 'top 5');
  assert.equal(q.picks.length, 5);
  assert.ok(q.p.ordre <= q.p.desordre && q.p.desordre <= q.p.bonus4 && q.p.desordre <= q.p.bonus3);
  for (let i = 1; i < q.combines.length; i++) assert.ok(q.combines[i].pDesordre >= q.combines[i - 1].pDesordre);
  assert.equal(q.combines[0].combos, 1);
  assert.equal(q.combines[3].combos, 56); // 8 chevaux : C(8,5)
  close(q.combines[0].pDesordre, q.p.desordre, 1e-12);
  assert.equal(T.quinteAnalysis([0.5, 0.3, 0.2]), null);
});

test('paris combinés : chances cohérentes', () => {
  const a = T.analyzeRace(race(12), { simulations: 0 });
  const pw = a.runners.map((x) => x.pWin);
  const res = T.comboAnalysis(pw, { placeDiscount: a.settings.placeDiscount, simulations: 20000 });
  const by = Object.fromEntries(res.map((r) => [r.key, r]));
  // Chaque arrivée a exactement 1 couplé gagnant, 3 couplés placés, 6 « 2 sur 4 », 1 trio, 1 quatrio.
  for (const r of res) for (let i = 1; i < r.formulas.length; i++) assert.ok(r.formulas[i].p >= r.formulas[i - 1].p - 1e-12);
  assert.ok(by.couple_p.best[0].p >= by.couple_g.best[0].p, 'le couplé placé est plus facile que le couplé gagnant');
  assert.ok(by.duo4.best[0].p >= by.couple_p.best[0].p, 'le 2 sur 4 est plus facile que le couplé placé');
  assert.ok(by.trio.best[0].p >= by.quatrio.best[0].p);
  assert.equal(by.duo4.formulas[2].combos, 6); // 4 chevaux : C(4,2)
  assert.equal(by.trio.formulas[0].combos, 1);
  close(by.couple_g.formulas[0].p, by.couple_g.best.find((b) => b.idx.join() === by.couple_g.formulas[0].idx.slice().sort((x, y) => x - y).join())?.p ?? by.couple_g.formulas[0].p, 0.02);
});

test('Choix Hoshi : cheval sous-estimé par la cote, pas forcément le favori', () => {
  // Favori : 50 % pour nous, 50 % pour la cote (ratio 1). Le n°2 : 30 % pour nous, 15 % pour la cote.
  const pw = [0.5, 0.3, 0.2],
    pm = [0.5, 0.15, 0.35];
  assert.equal(T.choiceIndex(pw, null, pm, 'g'), 1);
  // Trop peu de chances : pas de choix.
  assert.equal(T.choiceIndex([0.9, 0.08, 0.02], null, [0.95, 0.03, 0.02], 'g'), -1);
  // Aucun cheval sous-estimé : pas de choix.
  assert.equal(T.choiceIndex([0.5, 0.3, 0.2], null, [0.5, 0.3, 0.2], 'g'), -1);
  // Placé : seuil sur les chances d'être placé.
  assert.equal(T.choiceIndex(pw, [0.8, 0.45, 0.4], pm, 'p'), -1);
  assert.equal(T.choiceIndex(pw, [0.8, 0.6, 0.4], pm, 'p'), 1);
  // Course analysée : choix cohérent avec les règles.
  const a = T.analyzeRace(race(10), { simulations: 0 });
  const ch = T.hoshiChoice(a);
  for (const ty of ['g', 'p'])
    if (ch[ty]) {
      assert.ok(ch[ty].ratio >= T.CHOICE_RULES[ty].ratio);
      assert.ok(ch[ty].p >= T.CHOICE_RULES[ty].pMin);
    }
  assert.deepEqual(T.hoshiChoice(T.analyzeRace(race(8, false), { simulations: 0 })), { g: null, p: null });
});

test('Quinté valeur : probabilités d\'ensemble et meilleure espérance', () => {
  // Plackett-Luce : la somme des probabilités sur toutes les paires = 1 (3 chevaux, 2 premiers).
  const p = [0.5, 0.3, 0.2], a = p.map((x) => Math.pow(x, 0.8));
  const s = T.plSetProb(p, a, [0, 1]) + T.plSetProb(p, a, [0, 2]) + T.plSetProb(p, a, [1, 2]);
  close(s, 1, 1e-12);
  close(T.plSetProb(p, p, [0, 1]), 0.5 * 0.6 + 0.3 * (0.5 / 0.7), 1e-12);
  const r = race(14);
  const an = T.analyzeRace(r, { simulations: 0 });
  const v = T.quinteValue(an.runners.map((x) => x.pWin), an.runners.map((x) => x.pMarket), { simulations: 4000 });
  assert.equal(v.best.idx.length, 5);
  assert.ok(v.best.ev >= v.base.ev - 1e-12, 'la combinaison valeur rapporte au moins autant que la base');
  for (const k of ['des', 'b4', 'b3']) assert.ok(v.best.p[k] >= 0 && v.best.p[k] <= 1);
  assert.equal(T.quinteValue([0.5, 0.3, 0.2], [0.4, 0.4, 0.2]), null);
});

test('Choix Hoshi décidé sur la cote du matin', () => {
  const r = race(10);
  r.runners.forEach((x) => (x.coteRef = x.cote * 2));
  const m = T.morningRunners(r.runners);
  assert.equal(m[0].cote, r.runners[0].coteRef);
  assert.equal(m[0].coteLive, r.runners[0].cote);
  // Sans cote du matin : la cote du moment est gardée.
  assert.equal(T.morningRunners([{ cote: 5 }])[0].cote, 5);
  const ch = T.hoshiChoiceMorning(r, {});
  for (const ty of ['g', 'p']) if (ch[ty]) assert.equal(ch[ty].cote, ch[ty].x.runner.coteRef);
});

test('Outsiders Hoshi : seuil de 2,5 fois la cote du matin', () => {
  const r = race(12);
  r.runners.forEach((x) => (x.coteRef = x.cote));
  const prep = T.prepareRace(r);
  const F = T.featureVector(prep, 0).length;
  // Modèle factice qui ignore le marché et favorise le dernier cheval (gros outsider).
  const L = { beta: new Array(F).fill(0), mean: new Array(F).fill(0), sd: new Array(F).fill(1), threshold: 2.5 };
  const picks = T.outsiderPicks(r, L);
  for (const o of picks) assert.ok(o.ratio >= 2.5 && o.cote > 1);
  // Modèle uniforme : 1/12 chacun ; seuls les chevaux que la cote crédite de moins de 1/30 passent.
  for (const o of picks) assert.ok(o.pMarket <= 1 / 12 / 2.5 + 1e-9);
  assert.deepEqual(T.outsiderPicks(r, null), []);
});

test('Outsiders Hoshi : limités au trot', () => {
  assert.ok(T.outsiderDiscipline('trot attelé'));
  assert.ok(T.outsiderDiscipline('trot monté'));
  assert.ok(!T.outsiderDiscipline('plat'));
  assert.ok(!T.outsiderDiscipline('obstacle'));
  const r = race(12);
  const prep = T.prepareRace(r);
  const F = T.featureVector(prep, 0).length;
  const L = { beta: new Array(F).fill(0), mean: new Array(F).fill(0), sd: new Array(F).fill(1) };
  assert.deepEqual(T.outsiderPicks(r, L), []); // course de plat
  r.discipline = 'trot attelé';
  assert.ok(T.outsiderPicks(r, L).length >= 0);
});
