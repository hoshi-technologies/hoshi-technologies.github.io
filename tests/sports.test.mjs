// Tests du moteur Hoshi Sports : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../hippique/sports.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('cotes américaines → décimales', () => {
  assert.equal(S.americanToDecimal(150), 2.5);
  assert.equal(S.americanToDecimal(-200), 1.5);
  assert.equal(S.americanToDecimal('+295'), 3.95);
  assert.equal(S.americanToDecimal(''), null);
});

test('probabilités implicites : marge retirée', () => {
  const p = S.impliedProbs({ h: 2.1, d: 3.4, a: 3.6 });
  close(p.h + p.d + p.a, 1);
  assert.ok(p.margin > 0 && p.margin < 0.1);
});

test('probabilités de match : somme à 1, avantage du terrain, nul', () => {
  const foot = S.matchProbs(1500, 1500, { H: 60, c: 0.55 });
  close(foot.h + foot.d + foot.a, 1);
  assert.ok(foot.h > foot.a, 'le terrain avantage l\'équipe qui reçoit');
  assert.ok(foot.d > 0.2 && foot.d < 0.35, 'environ un quart de nuls à niveau égal');
  const neutre = S.matchProbs(1500, 1500, { H: 60, c: 0.55 }, true);
  close(neutre.h, neutre.a);
  const nba = S.matchProbs(1600, 1500, { H: 0, c: 0 });
  assert.equal(nba.d, 0);
  close(nba.h, 1 / (1 + Math.pow(10, -100 / 400)));
});

test('Elo : le gagnant monte, la somme est conservée, l\'écart de buts compte', () => {
  const ev = (id, w, s) => ({ id, date: id, status: 'post', winner: w, score: s, home: { id: 'A' }, away: { id: 'B' } });
  const r1 = S.replay([ev(1, 'home', [1, 0])], { K: 20, H: 0, c: 0.5, gd: true }).ratings;
  assert.ok(r1.A > 1500 && r1.B < 1500);
  close(r1.A + r1.B, 3000, 1e-9);
  const r3 = S.replay([ev(1, 'home', [4, 0])], { K: 20, H: 0, c: 0.5, gd: true }).ratings;
  assert.ok(r3.A > r1.A, 'une large victoire rapporte plus');
});

test('calibrage : retrouve un avantage du terrain réel', () => {
  // Monde simulé : 10 équipes, avantage du terrain de 80 points.
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const true_ = Array.from({ length: 10 }, (_, i) => 1400 + i * 22);
  const events = [];
  let t = 0;
  for (let round = 0; round < 60; round++)
    for (let h = 0; h < 10; h++) {
      const a = (h + 1 + (round % 9)) % 10;
      if (a === h) continue;
      const p = S.matchProbs(true_[h], true_[a], { H: 80, c: 0.55 });
      const x = rnd();
      const w = x < p.h ? 'home' : x < p.h + p.d ? 'draw' : 'away';
      events.push({ id: String(t), date: t++, status: 'post', winner: w, score: w === 'draw' ? [1, 1] : w === 'home' ? [1, 0] : [0, 1], home: { id: 'T' + h }, away: { id: 'T' + a } });
    }
  const cal = S.calibrate(events, 'foot');
  assert.ok(cal.params.H >= 50, 'avantage du terrain retrouvé : ' + cal.params.H);
  assert.ok(isFinite(cal.loss));
});

test('tennis : K diminue avec l\'expérience, pas de nul', () => {
  assert.ok(S.tennisK(0) > S.tennisK(100));
  const ev = { id: 1, date: 1, status: 'post', winner: 'away', home: { id: 'X' }, away: { id: 'Y' }, neutral: true };
  const r = S.replay([ev], S.DEFAULTS.tennis).ratings;
  assert.ok(r.Y > r.X);
});

test('mélange modèle / marché', () => {
  const m = S.blend({ h: 0.5, d: 0.3, a: 0.2 }, { h: 0.4, d: 0.3, a: 0.3 }, 0.5);
  close(m.h + m.d + m.a, 1);
  assert.ok(m.h < 0.5 && m.h > 0.4);
});
