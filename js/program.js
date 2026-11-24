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

// Raíces para reconocer encabezados aunque tengan acentos dañados (CSV de Excel) o texto extra.
const STEMS = { orden: 'orden', plataforma: 'plataf', categoria: 'categor', division: 'divisi', fase: 'fase', sistema: 'sistem', jueces: 'juec', panel: 'panel' };
const clean = (h) => norm(h).replace(/[^a-z0-9 #]/g, '').replace(/\s+/g, ' ').trim();

function mapHeaders(row) {
  const head = row.map(clean);
  const idx = {}; const used = new Set();
  for (const [k, names] of Object.entries(COLS)) {
    idx[k] = head.findIndex((h, i) => !used.has(i) && names.map(clean).includes(h));
    if (idx[k] >= 0) used.add(idx[k]);
  }
  for (const [k, stem] of Object.entries(STEMS)) {
    if (idx[k] >= 0) continue;
    idx[k] = head.findIndex((h, i) => !used.has(i) && h.includes(stem) && !/rojo|azul/.test(h));
    if (idx[k] >= 0) used.add(idx[k]);
  }
  return idx;
}
const firstInt = (s) => { const m = String(s ?? '').match(/\d+/); return m ? parseInt(m[0], 10) : NaN; };

// Devuelve { bouts: [...], errors: ['Fila 3: ...'], warnings: [...] }
export function parseProgram(text, { plataformas = 3 } = {}) {
  const rows = parseTable(text);
  // La fila de encabezados puede no ser la primera (títulos arriba de la tabla).
  let hi = -1, idx = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const m = mapHeaders(rows[i]);
    if (m.rojo >= 0 && m.azul >= 0) { hi = i; idx = m; break; }
  }
  if (hi < 0) return { bouts: [], warnings: [], errors: ['No se encontraron las columnas "Rojo" y "Azul". La tabla debe incluir la fila de títulos (usa la plantilla).'] };
  rows.splice(0, hi);
  const errors = [], warnings = [];
  if (idx.plataforma < 0) warnings.push('No hay columna "Plataforma": todos los combates irán a la plataforma 1.');
  if (idx.categoria < 0) warnings.push('No hay columna "Categoría": todos los combates serán Adulto oficial.');
  if (idx.jueces < 0) warnings.push('No hay columna "Jueces": todos los combates usarán 3 jueces.');
  const val = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  const bouts = [];
  rows.slice(1).forEach((r, i) => {
    const line = hi + i + 2;
    const rojo = val(r, 'rojo'), azul = val(r, 'azul');
    if (!rojo && !azul) return;
    const ck = catKey(val(r, 'categoria'));
    const plat = val(r, 'plataforma') ? firstInt(val(r, 'plataforma')) : 1;
    const jue = val(r, 'jueces') ? firstInt(val(r, 'jueces')) : 3;
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
  return { bouts, errors, warnings };
}
