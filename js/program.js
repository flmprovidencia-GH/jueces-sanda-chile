// Lectura del programa de combates copiado desde Google Sheets (texto separado por
// tabuladores) o descargado como CSV. Módulo puro, probado con `node --test`.
import { CATEGORIES } from './logic.js';

export const TEMPLATE_HEADERS = ['Orden', 'Plataforma', 'Categoría', 'División', 'Fase', 'Sistema', 'Jueces', 'Panel', 'KO',
  'Rojo', 'Club rojo', 'Peso rojo', 'Azul', 'Club azul', 'Peso azul'];

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Separa filas/celdas respetando comillas (formato CSV/TSV de Google Sheets).
export function parseTable(text) {
  const t = String(text || '').replace(/\r\n?/g, '\n');
  const firstLine = t.split('\n').find((l) => l.trim()) || '';
  const sep = firstLine.includes('\t') ? '\t' : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const COLS = {
  orden: ['orden', 'n', 'nro', 'numero', '#'],
  plataforma: ['plataforma', 'tatami', 'lei tai', 'leitai'],
  categoria: ['categoria'],
  division: ['division', 'peso', 'division de peso', 'categoria de peso'],
  fase: ['fase', 'ronda', 'etapa'],
  sistema: ['sistema'],
  jueces: ['jueces', 'n jueces', 'numero de jueces'],
  panel: ['panel', 'turno'],
  ko: ['ko', 'ko permitido', 'ko acordado'],
  rojo: ['rojo', 'nombre rojo', 'competidor rojo', 'esquina roja'],
  rojoClub: ['club rojo', 'equipo rojo'],
  rojoPeso: ['peso rojo'],
  azul: ['azul', 'nombre azul', 'competidor azul', 'esquina azul'],
  azulClub: ['club azul', 'equipo azul'],
  azulPeso: ['peso azul'],
};

export function catKey(s) {
  const n = norm(s);
  if (!n) return 'oficial';
  if (n.includes('super')) return 'superlucha';
  if (n.includes('light') || n.includes('ligh')) return 'light';
  if (n.includes('infan')) return 'infantil';
  if (n.includes('juven') || n.includes('junior')) return 'juvenil';
  if (n.includes('oficial') || n.includes('adulto')) return 'oficial';
  return CATEGORIES[n] ? n : null;
}
const num = (s) => { const v = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const yes = (s) => /^(si|s|x|yes|1|true|verdadero)$/.test(norm(s));

// Devuelve { bouts: [...], errors: ['Fila 3: ...'] }
export function parseProgram(text, { plataformas = 3 } = {}) {
  const rows = parseTable(text);
  if (rows.length < 2) return { bouts: [], errors: ['Pega la tabla completa, incluyendo la fila de títulos.'] };
  const head = rows[0].map(norm);
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex((h) => names.includes(h));
  const errors = [];
  for (const k of ['rojo', 'azul']) if (idx[k] < 0) errors.push(`Falta la columna "${k === 'rojo' ? 'Rojo' : 'Azul'}".`);
  if (errors.length) return { bouts: [], errors };
  const val = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  const bouts = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const rojo = val(r, 'rojo'), azul = val(r, 'azul');
    if (!rojo && !azul) return;
    const ck = catKey(val(r, 'categoria'));
    const plat = parseInt(val(r, 'plataforma') || '1', 10);
    const jue = parseInt(val(r, 'jueces') || '3', 10);
    if (!ck) errors.push(`Fila ${line}: categoría "${val(r, 'categoria')}" no reconocida (usa Infantil, Juvenil, Adulto light, Adulto oficial o Super lucha).`);
    if (!(plat >= 1 && plat <= plataformas)) errors.push(`Fila ${line}: plataforma "${val(r, 'plataforma')}" debe ser entre 1 y ${plataformas}.`);
    if (![3, 5].includes(jue)) errors.push(`Fila ${line}: jueces debe ser 3 o 5.`);
    if (!rojo || !azul) errors.push(`Fila ${line}: falta el nombre de ${!rojo ? 'Rojo' : 'Azul'}.`);
    const cat = CATEGORIES[ck || 'oficial'];
    const koTxt = val(r, 'ko');
    bouts.push({
      orden: num(val(r, 'orden')) ?? bouts.length + 1,
      plataforma: plat, catKey: ck || 'oficial',
      division: val(r, 'division'), fase: val(r, 'fase'),
      system: norm(val(r, 'sistema')).startsWith('todos') ? 'todos' : 'eliminacion',
      judges: jue === 5 ? 5 : 3,
      panel: val(r, 'panel'),
      koAllowed: koTxt ? yes(koTxt) : cat.koAllowed,
      rojo: { name: rojo, club: val(r, 'rojoClub'), weight: num(val(r, 'rojoPeso')) },
      azul: { name: azul, club: val(r, 'azulClub'), weight: num(val(r, 'azulPeso')) },
    });
  });
  return { bouts, errors };
}
