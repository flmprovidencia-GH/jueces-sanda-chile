// Reglas de puntuación Wushu Sanda (IWUF 2024) + adaptaciones locales.
// Módulo puro: sin DOM ni red, para poder probarlo con `node --test`.

export const SIDES = ['rojo', 'azul'];
export const other = (s) => (s === 'rojo' ? 'azul' : 'rojo');

// Categorías por defecto (editables desde la app).
export const CATEGORIES = {
  infantil: {
    name: 'Infantil', roundSec: 90, restSec: 60, always3: false, koAllowed: false, excessContact: false,
    notes: 'Prohibido golpear la cabeza con patadas y puños continuos a la cara (Art. 18.4).',
  },
  juvenil: {
    name: 'Juvenil', roundSec: 90, restSec: 60, always3: false, koAllowed: false, excessContact: false,
    notes: 'Prohibido golpear la cabeza con patadas y puños continuos a la cara (Art. 18.4).',
  },
  light: {
    name: 'Adulto light', roundSec: 120, restSec: 60, always3: false, koAllowed: false, excessContact: true,
    notes: 'Más protecciones. KO prohibido salvo acuerdo previo. El exceso de contacto se penaliza.',
  },
  oficial: {
    name: 'Adulto oficial', roundSec: 120, restSec: 60, always3: false, koAllowed: true, excessContact: false,
    notes: 'Reglamento IWUF completo.',
  },
  superlucha: {
    name: 'Super lucha', roundSec: 120, restSec: 60, always3: true, koAllowed: true, excessContact: false,
    notes: 'Pleno contacto (varones a torso desnudo). Se pelean siempre los 3 rounds: un KO en el 3.º decide aunque el rival lleve 2 rounds.',
  },
};

// Acciones que registra la mesa central. `side` del evento = quien COMETE / RECIBE la acción;
// los puntos van al rival.
export const EVENT_TYPES = {
  amon:    { label: 'Amonestación', short: 'Amon.', pts: 1, help: 'Falta técnica → +1 rival' },
  adv:     { label: 'Advertencia', short: 'Adv.', pts: 2, help: 'Falta personal → +2 rival' },
  exceso:  { label: 'Exceso de contacto', short: 'Exceso', pts: 2, help: 'Cuenta como advertencia → +2 rival' },
  conteo:  { label: 'Conteo forzado', short: 'Conteo', pts: 2, help: '+2 rival' },
  salida:  { label: 'Salida de plataforma', short: 'Salida', pts: 2, help: '+2 rival' },
  pasivo:  { label: 'No ataca 5 s / no se levanta 3 s', short: '5s/3s', pts: 1, help: '+1 rival' },
};

const isWarning = (t) => t === 'adv' || t === 'exceso';

export function countEvents(events, side, pred, round) {
  return (events || []).filter((e) => e.side === side && pred(e.type) && (round == null || e.round === round)).length;
}
export const warnings = (ev, side, round) => countEvents(ev, side, isWarning, round);
export const admonitions = (ev, side, round) => countEvents(ev, side, (t) => t === 'amon', round);
export const counts = (ev, side, round) => countEvents(ev, side, (t) => t === 'conteo', round);
export const offPlatform = (ev, side, round) => countEvents(ev, side, (t) => t === 'salida', round);

// Puntos de penalización que recibe `side` en el round (por acciones del rival).
export function penaltyPoints(events, side, round) {
  return (events || [])
    .filter((e) => e.round === round && e.side === other(side))
    .reduce((s, e) => s + (EVENT_TYPES[e.type]?.pts || 0), 0);
}

export function judgeTaps(judgeDoc, round) {
  const t = judgeDoc?.taps?.[round] || {};
  return { rojo: Math.max(0, t.rojo || 0), azul: Math.max(0, t.azul || 0) };
}

// Total de un juez en un round = sus golpes marcados + penalizaciones de la mesa.
export function judgeTotals(bout, judgeDoc, round) {
  const taps = judgeTaps(judgeDoc, round);
  return {
    rojo: taps.rojo + penaltyPoints(bout.events, 'rojo', round),
    azul: taps.azul + penaltyPoints(bout.events, 'azul', round),
  };
}

// Desempate (Art. 24.2.4): menos advertencias → menos amonestaciones → menor peso.
function tiebreak(bout, round) {
  const ev = bout.events;
  const steps = [
    ['menos advertencias', (s) => warnings(ev, s, round)],
    ['menos amonestaciones', (s) => admonitions(ev, s, round)],
    ['menor peso', (s) => Number(bout[s]?.weight) || Infinity],
  ];
  for (const [why, f] of steps) {
    const r = f('rojo'), a = f('azul');
    if (r === Infinity && a === Infinity) continue;
    if (r < a) return { winner: 'rojo', why };
    if (a < r) return { winner: 'azul', why };
  }
  return { winner: 'empate', why: 'empate total' };
}

// Voto de un juez para el round.
export function judgeVote(bout, judgeDoc, round) {
  const t = judgeTotals(bout, judgeDoc, round);
  if (t.rojo > t.azul) return { vote: 'rojo', totals: t, why: 'puntos' };
  if (t.azul > t.rojo) return { vote: 'azul', totals: t, why: 'puntos' };
  const tb = tiebreak(bout, round);
  return { vote: tb.winner, totals: t, why: tb.why };
}

// Resultado del round (Art. 24.2).
export function roundResult(bout, judgeDocs, round) {
  const ev = bout.events;
  const n = bout.judges;
  const votes = [];
  for (let j = 1; j <= n; j++) votes.push({ judge: j, ...judgeVote(bout, judgeDocs?.[j], round) });
  for (const s of SIDES) {
    if (counts(ev, s, round) >= 2) return { winner: other(s), reason: `2 conteos forzados a ${s}`, votes };
    if (offPlatform(ev, s, round) >= 2) return { winner: other(s), reason: `2 salidas de plataforma de ${s}`, votes };
  }
  const tally = { rojo: 0, azul: 0, empate: 0 };
  votes.forEach((v) => tally[v.vote]++);
  let winner = 'empate';
  if (tally.rojo > tally.azul) winner = 'rojo';
  else if (tally.azul > tally.rojo) winner = 'azul';
  return { winner, reason: `Jueces ${tally.rojo}-${tally.azul}${tally.empate ? ` (${tally.empate} empate)` : ''}`, votes, tally };
}

// Victoria absoluta por 12+ puntos (Art. 24.1.4): todos los jueces deben confirmarlo
// (con 5 jueces = los 5; el club la aplica también con 3 jueces).
export function twelvePoint(bout, judgeDocs, round) {
  let side = null;
  for (let j = 1; j <= bout.judges; j++) {
    const t = judgeTotals(bout, judgeDocs?.[j], round);
    const d = t.rojo - t.azul;
    const s = d >= 12 ? 'rojo' : d <= -12 ? 'azul' : null;
    if (!s || (side && side !== s)) return null;
    side = s;
  }
  return side;
}

// Estado del combate a partir de los rounds anunciados y las penalizaciones.
export function boutStatus(bout) {
  const ev = bout.events || [];
  const announced = Object.entries(bout.rounds || {}).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  const wins = { rojo: 0, azul: 0 };
  announced.forEach((r) => { if (r.winner in wins) wins[r.winner]++; });
  const base = { wins, played: announced.length };

  if (bout.result?.winner) return { ...base, decided: true, ...bout.result };

  for (const s of SIDES) {
    if (warnings(ev, s) >= 3) return { ...base, decided: true, winner: other(s), reason: `Descalificación: 3 faltas personales de ${s}`, auto: true };
    if (counts(ev, s) >= 3) return { ...base, decided: true, winner: other(s), reason: `Victoria absoluta: 3 conteos forzados a ${s}`, auto: true };
  }

  const always3 = bout.cat?.always3;
  if (!always3) {
    for (const s of SIDES) if (wins[s] >= 2) return { ...base, decided: true, winner: s, reason: `Gana ${wins[s]}-${wins[other(s)]} en rounds` };
  }
  if (announced.length < 3) return { ...base, decided: false };

  if (wins.rojo !== wins.azul) {
    const w = wins.rojo > wins.azul ? 'rojo' : 'azul';
    return { ...base, decided: true, winner: w, reason: `Gana ${wins[w]}-${wins[other(w)]} en rounds` };
  }
  // Empate en rounds (Art. 24.3.5–24.3.7)
  if (bout.system === 'todos') return { ...base, decided: true, winner: 'empate', reason: 'Empate (todos contra todos)' };
  const steps = [['menos advertencias', (s) => warnings(ev, s)], ['menos amonestaciones', (s) => admonitions(ev, s)]];
  for (const [why, f] of steps) {
    const r = f('rojo'), a = f('azul');
    if (r !== a) { const w = r < a ? 'rojo' : 'azul'; return { ...base, decided: true, winner: w, reason: `Empate en rounds; gana por ${why}` }; }
  }
  return { ...base, decided: false, needExtra: true, reason: 'Empate: se agrega un round extra' };
}

// ¿Se puede pelear otro round?
export function nextRoundAllowed(bout) {
  const st = boutStatus(bout);
  if (st.decided) return false;
  return st.played < 3 || st.needExtra;
}
