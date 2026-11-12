import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram, parseTable } from '../js/program.js';

const TSV = [
  'Orden\tPlataforma\tCategoría\tDivisión\tFase\tSistema\tJueces\tPanel\tKO\tRojo\tClub rojo\tPeso rojo\tAzul\tClub azul\tPeso azul',
  '1\t1\tInfantil\t-40 kg\tFinal\tEliminación\t3\tPanel A\t\tTomás Díaz\tClub Dragón\t39,5\tLuis Pérez\tClub Tigre\t38.9',
  '2\t2\tSuper Lucha\t-70 kg\tSemifinal\tTodos contra todos\t5\tPanel B\tsí\tAna "La Roca" Soto\tClub Grulla\t69\tMaría Ruiz\t\t70',
  '\t\t\t\t\t\t\t\t\t\t\t\t\t\t',
].join('\n');

test('lee una tabla copiada desde Google Sheets', () => {
  const { bouts, errors } = parseProgram(TSV);
  assert.deepEqual(errors, []);
  assert.equal(bouts.length, 2);
  assert.equal(bouts[0].catKey, 'infantil');
  assert.equal(bouts[0].koAllowed, false);
  assert.equal(bouts[0].rojo.weight, 39.5);
  assert.equal(bouts[1].catKey, 'superlucha');
  assert.equal(bouts[1].system, 'todos');
  assert.equal(bouts[1].judges, 5);
  assert.equal(bouts[1].rojo.name, 'Ana "La Roca" Soto');
});

test('CSV con comillas y punto y coma', () => {
  const rows = parseTable('a;b\n"x;y";"z ""q"""\n');
  assert.deepEqual(rows, [['a', 'b'], ['x;y', 'z "q"']]);
});

test('informa errores por fila', () => {
  const { errors } = parseProgram('Plataforma,Categoría,Jueces,Rojo,Azul\n4,Kickboxing,4,A,\n', { plataformas: 3 });
  assert.equal(errors.length, 4);
  assert.match(errors[0], /Fila 2/);
});
