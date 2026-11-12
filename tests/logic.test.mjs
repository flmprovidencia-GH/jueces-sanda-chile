import test from 'node:test';
import assert from 'node:assert/strict';
import { roundResult, boutStatus, twelvePoint, judgeTotals, CATEGORIES } from '../js/logic.js';

const mk = (o = {}) => ({
  judges: 3, system: 'eliminacion', cat: CATEGORIES.oficial,
  rojo: { name: 'R', weight: 65 }, azul: { name: 'A', weight: 64 },
  events: [], rounds: {}, ...o,
});
const J = (...rounds) => ({ taps: Object.fromEntries(rounds.map((t, i) => [i + 1, { rojo: t[0], azul: t[1] }])) });

test('penalizaciones suman al rival en el total de cada juez', () => {
  const b = mk({ events: [{ round: 1, side: 'azul', type: 'adv' }, { round: 1, side: 'rojo', type: 'amon' }] });
  assert.deepEqual(judgeTotals(b, J([3, 3]), 1), { rojo: 5, azul: 4 });
});

test('ganador del round por mayoría de jueces', () => {
  const b = mk();
  const r = roundResult(b, { 1: J([5, 3]), 2: J([2, 4]), 3: J([6, 1]) }, 1);
  assert.equal(r.winner, 'rojo');
  assert.deepEqual(r.tally, { rojo: 2, azul: 1, empate: 0 });
});

test('empate de un juez se desempata por advertencias, amonestaciones y peso', () => {
  const b = mk(); // sin penalizaciones → gana el más liviano (azul 64kg)
  const r = roundResult(b, { 1: J([3, 3]), 2: J([3, 3]), 3: J([3, 3]) }, 1);
  assert.equal(r.winner, 'azul');
  assert.equal(r.votes[0].why, 'menor peso');
});

test('2 salidas de plataforma dan el round al rival aunque pierda en puntos', () => {
  const b = mk({ events: [{ round: 1, side: 'rojo', type: 'salida' }, { round: 1, side: 'rojo', type: 'salida' }] });
  const r = roundResult(b, { 1: J([20, 0]), 2: J([20, 0]), 3: J([20, 0]) }, 1);
  assert.equal(r.winner, 'azul');
});

test('regla de 12 puntos exige a todos los jueces (también con 3)', () => {
  const b = mk();
  assert.equal(twelvePoint(b, { 1: J([14, 1]), 2: J([13, 1]), 3: J([12, 0]) }, 1), 'rojo');
  assert.equal(twelvePoint(b, { 1: J([14, 1]), 2: J([13, 1]), 3: J([10, 0]) }, 1), null);
});

test('2 rounds ganados terminan el combate (oficial)', () => {
  const st = boutStatus(mk({ rounds: { 1: { winner: 'rojo' }, 2: { winner: 'rojo' } } }));
  assert.equal(st.decided, true);
  assert.equal(st.winner, 'rojo');
});

test('super lucha: con 2-0 se sigue al 3er round', () => {
  const st = boutStatus(mk({ cat: CATEGORIES.superlucha, rounds: { 1: { winner: 'rojo' }, 2: { winner: 'rojo' } } }));
  assert.equal(st.decided, false);
});

test('3 advertencias = descalificación', () => {
  const ev = [1, 1, 2].map((round) => ({ round, side: 'azul', type: 'adv' }));
  const st = boutStatus(mk({ events: ev }));
  assert.equal(st.winner, 'rojo');
  assert.match(st.reason, /Descalificación/);
});

test('empate en rounds: todos contra todos = empate; eliminación = round extra', () => {
  const rounds = { 1: { winner: 'rojo' }, 2: { winner: 'azul' }, 3: { winner: 'empate' } };
  assert.equal(boutStatus(mk({ system: 'todos', rounds })).winner, 'empate');
  const st = boutStatus(mk({ rounds }));
  assert.equal(st.decided, false);
  assert.equal(st.needExtra, true);
});
