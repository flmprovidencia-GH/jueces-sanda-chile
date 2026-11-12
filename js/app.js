import { store, MODE, now } from './store.js';
import {
  CATEGORIES, EVENT_TYPES, SIDES, other, judgeTaps, judgeTotals, roundResult, twelvePoint, boutStatus,
  nextRoundAllowed, warnings, admonitions, counts, offPlatform,
} from './logic.js';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIDE_LABEL = { rojo: 'Rojo', azul: 'Azul', empate: 'Empate' };
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const remaining = (t) => (!t ? 0 : t.running ? t.endsAt - now() : t.remaining);
const uid = () => Math.random().toString(36).slice(2, 10);
const fighter = (b, s) => `<span class="txt-${s}">${esc(b[s]?.name || SIDE_LABEL[s])}</span>`;
const linkFor = (path) => `${location.origin}${location.pathname}#${path}`;

let cleanup = [];
function reset() { cleanup.forEach((f) => f && f()); cleanup = []; }

function route() {
  reset();
  const [, view, code, n] = location.hash.replace(/^#/, '').split('/');
  if (view === 'mesa' && code) return mesaView(code);
  if (view === 'juez' && code) return n ? judgeView(code, Number(n)) : judgePick(code);
  if (view === 'pantalla' && code) return screenView(code);
  return homeView();
}
addEventListener('hashchange', route);

// =================================================================== INICIO
async function homeView() {
  const catOpts = Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${esc(c.name)}</option>`).join('');
  $app.innerHTML = `
  <div class="wrap">
    <div class="row"><h1 class="grow">🥋 Jueces Sanda Chile</h1>
      <span class="tag ${MODE === 'firebase' ? 'ok' : ''}">${MODE === 'firebase' ? 'En línea' : 'Modo local (pruebas)'}</span></div>
    <form class="card" id="f">
      <h2>Nuevo combate</h2>
      <div class="grid2">
        <div>
          <label>Categoría</label><select name="cat">${catOpts}</select>
          <p class="muted" id="catNotes" style="font-size:.85rem"></p>
          <div class="row">
            <div class="grow"><label>Duración round (seg)</label><input name="roundSec" type="number" min="30" step="10"></div>
            <div class="grow"><label>Descanso (seg)</label><input name="restSec" type="number" min="0" step="10"></div>
          </div>
        </div>
        <div>
          <label>Descripción (ej. "Semifinal -65 kg")</label><input name="label" placeholder="Opcional">
          <div class="row">
            <div class="grow"><label>Sistema</label><select name="system">
              <option value="eliminacion">Eliminación</option><option value="todos">Todos contra todos</option></select></div>
            <div class="grow"><label>Jueces de línea</label><select name="judges">
              <option value="3">3 jueces</option><option value="5">5 jueces</option></select></div>
          </div>
          <label style="display:flex;gap:8px;align-items:center;margin-top:12px">
            <input type="checkbox" name="koAllowed"> <span id="koLbl">KO permitido</span></label>
        </div>
      </div>
      <div class="grid2" style="margin-top:10px">
        ${SIDES.map((s) => `
        <div class="card side-${s}" style="margin:0">
          <h3 class="txt-${s}">Esquina ${SIDE_LABEL[s]}</h3>
          <label>Nombre</label><input name="${s}_name" required>
          <div class="row">
            <div class="grow"><label>Club / equipo</label><input name="${s}_club"></div>
            <div style="width:110px"><label>Peso (kg)</label><input name="${s}_weight" type="number" step="0.1" min="0"></div>
          </div>
        </div>`).join('')}
      </div>
      <div class="row" style="margin-top:14px"><button class="primary" type="submit">Crear combate</button></div>
    </form>
    <div class="card"><h2>Combates</h2><div id="list" class="muted">Cargando…</div></div>
  </div>`;

  const f = document.getElementById('f');
  const syncCat = () => {
    const c = CATEGORIES[f.cat.value];
    f.roundSec.value = c.roundSec; f.restSec.value = c.restSec; f.koAllowed.checked = c.koAllowed;
    document.getElementById('koLbl').textContent = c.koAllowed ? 'KO permitido' : 'KO acordado previamente (normalmente prohibido)';
    document.getElementById('catNotes').textContent = c.notes;
  };
  f.cat.onchange = syncCat; syncCat();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const catKey = fd.get('cat');
    const cat = { key: catKey, ...CATEGORIES[catKey], roundSec: Number(fd.get('roundSec')), restSec: Number(fd.get('restSec')), koAllowed: f.koAllowed.checked };
    const side = (s) => ({ name: fd.get(`${s}_name`).trim(), club: fd.get(`${s}_club`).trim(), weight: fd.get(`${s}_weight`) ? Number(fd.get(`${s}_weight`)) : null });
    f.querySelector('button[type=submit]').disabled = true;
    const code = await store.createBout({
      label: fd.get('label').trim(), cat, system: fd.get('system'), judges: Number(fd.get('judges')),
      rojo: side('rojo'), azul: side('azul'),
      round: 1, phase: 'listo', timer: { running: false, remaining: cat.roundSec * 1000 },
      events: [], rounds: {}, result: null,
    });
    location.hash = `#/mesa/${code}`;
  };

  const bouts = await store.listBouts();
  document.getElementById('list').innerHTML = bouts.length ? `<table>
    <tr><th>Código</th><th>Combate</th><th>Categoría</th><th>Resultado</th><th></th></tr>
    ${bouts.map((b) => `<tr>
      <td><code>${b.code}</code></td>
      <td>${fighter(b, 'rojo')} vs ${fighter(b, 'azul')}${b.label ? `<br><span class="muted">${esc(b.label)}</span>` : ''}</td>
      <td>${esc(b.cat?.name)}</td>
      <td>${b.result?.winner ? (b.result.winner === 'empate' ? 'Empate' : fighter(b, b.result.winner)) : '<span class="muted">En curso</span>'}</td>
      <td><a href="#/mesa/${b.code}">Abrir</a></td></tr>`).join('')}</table>` : 'Aún no hay combates.';
}

// ============================================================== MESA CENTRAL
function mesaView(code) {
  let bout = null, judges = {}, unJ = null, override = '';
  const tick = setInterval(() => {
    if (!bout) return;
    const el = document.getElementById('clock');
    const ms = remaining(bout.timer);
    if (el) { el.textContent = fmt(ms); el.classList.toggle('low', ms < 10000); }
    // Fin automático del tiempo
    if (bout.timer?.running && ms <= 0) {
      if (bout.phase === 'combate') act.endRound();
      else if (bout.phase === 'descanso') store.updateBout(code, { timer: { running: false, remaining: 0 } });
    }
  }, 200);
  cleanup.push(() => clearInterval(tick));

  cleanup.push(store.watchBout(code, (b) => {
    if (!b) { $app.innerHTML = `<div class="wrap"><p>Combate <b>${esc(code)}</b> no encontrado. <a href="#/">Volver</a></p></div>`; return; }
    const first = !bout; bout = b;
    if (first) { unJ = store.watchJudges(code, b.judges, (j) => { judges = j; render(); }); cleanup.push(unJ); }
    render();
  }));

  const save = (patch) => store.updateBout(code, patch);
  const act = {
    start() {
      save({ phase: 'combate', timer: { running: true, endsAt: now() + bout.cat.roundSec * 1000 } });
    },
    pause() { save({ timer: { running: false, remaining: remaining(bout.timer) } }); },
    resume() { save({ timer: { running: true, endsAt: now() + remaining(bout.timer) } }); },
    endRound() { save({ phase: 'revision', timer: { running: false, remaining: 0 } }); },
    addEvent(side, type) {
      save({ events: [...(bout.events || []), { id: uid(), round: bout.round, side, type, t: now() }] });
    },
    delEvent(id) { save({ events: (bout.events || []).filter((e) => e.id !== id) }); },
    announce() {
      const rr = roundResult(bout, judges, bout.round);
      const winner = override || rr.winner;
      const snap = rr.votes.map((v) => ({ judge: v.judge, vote: v.vote, rojo: v.totals.rojo, azul: v.totals.azul }));
      const rounds = { ...bout.rounds, [bout.round]: { winner, reason: override ? 'Corregido por mesa central' : rr.reason, votes: snap } };
      override = '';
      const nb = { ...bout, rounds };
      const st = boutStatus(nb);
      if (st.decided) save({ rounds, phase: 'cierre', timer: { running: false, remaining: 0 } });
      else save({ rounds, phase: 'descanso', timer: { running: true, endsAt: now() + bout.cat.restSec * 1000 } });
    },
    nextRound() { save({ round: bout.round + 1, phase: 'listo', timer: { running: false, remaining: bout.cat.roundSec * 1000 } }); },
    finish(result) { save({ result: { ...result, at: now() }, phase: 'final', timer: { running: false, remaining: 0 } }); },
    reopen() { if (confirm('¿Reabrir el combate para corregir?')) save({ result: null, phase: 'revision' }); },
    absolute(kind) {
      const labels = { ko: 'KO / no se levanta en 10 s', sup: 'Superioridad declarada por el árbitro', les: 'Lesión / abandono del rival', dq: 'Descalificación del rival', doce: 'Diferencia de 12 puntos' };
      if (kind === 'ko' && !bout.cat.koAllowed && !confirm('El KO NO está permitido en esta categoría (salvo acuerdo previo). ¿Registrar igual?')) return;
      const w = prompt(`${labels[kind]}\n¿Quién GANA? Escribe R (rojo) o A (azul):`);
      const side = /^r/i.test(w || '') ? 'rojo' : /^a/i.test(w || '') ? 'azul' : null;
      if (!side) return;
      act.finish({ winner: side, reason: `Victoria absoluta: ${labels[kind]}` });
    },
  };

  function render() {
    if (!bout) return;
    const b = bout, r = b.round, ph = b.phase;
    const st = boutStatus(b);
    const rr = roundResult(b, judges, r);
    const doce = twelvePoint(b, judges, r);
    const live = ['combate', 'revision'].includes(ph);
    const evRound = (b.events || []).filter((e) => e.round === r);
    const phaseTxt = { listo: `Listo para round ${r}`, combate: b.timer?.running ? `Round ${r} en curso` : `Round ${r} detenido`, revision: `Revisión del round ${r}`, descanso: `Descanso — próximo round ${r + 1}`, cierre: 'Combate terminado: confirmar resultado', final: 'Combate finalizado' }[ph];

    let banner = '';
    if (ph === 'final' && b.result) banner = `<div class="banner final"><b>Resultado:</b> ${b.result.winner === 'empate' ? 'EMPATE' : `GANA ${fighter(b, b.result.winner)}`} — ${esc(b.result.reason)} <button class="small" data-a="reopen">Reabrir</button></div>`;
    else if (st.decided) banner = `<div class="banner"><b>${st.auto ? '⚠️ ' : ''}${st.winner === 'empate' ? 'EMPATE' : `Gana ${fighter(b, st.winner)}`}</b> — ${esc(st.reason)}
      <button class="primary small" data-a="confirmFinal">Confirmar y cerrar combate</button></div>`;
    else if (st.needExtra && ph === 'descanso') banner = `<div class="banner">${esc(st.reason)}</div>`;
    if (doce && live && ph !== 'final') banner += `<div class="banner">⚠️ Todos los jueces marcan 12+ puntos de diferencia a favor de ${fighter(b, doce)}.
      <button class="warn small" data-a="doce" data-side="${doce}">Declarar victoria absoluta</button></div>`;

    const judgeRows = rr.votes.map((v) => {
      const taps = judgeTaps(judges[v.judge], r);
      const on = !!judges[v.judge];
      return `<tr><td><span class="dot ${on ? 'on' : ''}"></span>Juez ${v.judge}</td>
        <td class="big txt-rojo">${v.totals.rojo}</td><td class="muted">${taps.rojo}</td>
        <td class="big txt-azul">${v.totals.azul}</td><td class="muted">${taps.azul}</td>
        <td>${v.vote === 'empate' ? '<span class="tag">Empate</span>' : `<span class="tag ${v.vote}">${SIDE_LABEL[v.vote]}</span>`}
        ${v.why !== 'puntos' ? `<br><span class="muted" style="font-size:.75rem">${esc(v.why)}</span>` : ''}</td></tr>`;
    }).join('');

    const roundsCells = [1, 2, 3, ...(r > 3 ? [r] : [])].filter((x, i, a) => a.indexOf(x) === i).map((n) => {
      const rd = b.rounds?.[n];
      return `<td>${rd ? (rd.winner === 'empate' ? '<span class="tag">Empate</span>' : `<span class="tag ${rd.winner}">${SIDE_LABEL[rd.winner]}</span>`) : (n === r && ph !== 'final' ? '<span class="muted">en curso</span>' : '—')}</td>`;
    });

    const penPanel = (s) => `
      <div class="card side-${s}" style="margin:0">
        <h3>${fighter(b, s)} <span class="muted">comete / recibe</span></h3>
        <div class="pen-grid">
          ${Object.entries(EVENT_TYPES).filter(([k]) => k !== 'exceso' || b.cat.excessContact).map(([k, t]) =>
            `<button data-a="ev" data-side="${s}" data-type="${k}" ${live ? '' : 'disabled'} title="${esc(t.help)}">${esc(t.label)}<br><span class="muted">${esc(t.help)}</span></button>`).join('')}
        </div>
        <p class="muted" style="font-size:.85rem;margin:8px 0 0">Combate: Adv ${warnings(b.events, s)} · Amon ${admonitions(b.events, s)} · Conteos ${counts(b.events, s)} · Salidas (round) ${offPlatform(b.events, s, r)}</p>
      </div>`;

    $app.innerHTML = `
    <div class="wrap">
      <div class="row">
        <a href="#/">← Inicio</a>
        <h1 class="grow" style="margin:0">Mesa central <span class="muted">· ${esc(b.cat.name)}${b.label ? ` · ${esc(b.label)}` : ''}</span></h1>
        <span class="tag">Código <b>${b.code}</b></span>
        <a class="tag" href="#/pantalla/${b.code}" target="_blank">Pantalla pública ↗</a>
      </div>
      <p class="muted" style="margin:6px 0 14px">${esc(b.cat.notes)} · ${b.judges} jueces · ${b.system === 'todos' ? 'Todos contra todos' : 'Eliminación'}${b.cat.koAllowed ? '' : ' · <b>KO no permitido</b>'}</p>
      ${banner}
      <div class="grid2">
        <div class="card">
          <div class="row"><div class="grow"><h3>${phaseTxt}</h3><div class="timer" id="clock">${fmt(remaining(b.timer))}</div></div>
            <div class="row">
              ${ph === 'listo' ? `<button class="primary" data-a="start">▶ Iniciar round ${r}</button>` : ''}
              ${ph === 'combate' && b.timer?.running ? `<button class="warn" data-a="pause">⏸ Detener</button>` : ''}
              ${ph === 'combate' && !b.timer?.running ? `<button class="primary" data-a="resume">▶ Reanudar</button>` : ''}
              ${ph === 'combate' ? `<button data-a="endRound">Fin del round</button>` : ''}
              ${ph === 'descanso' && nextRoundAllowed(b) ? `<button class="primary" data-a="nextRound">Preparar round ${r + 1}</button>` : ''}
            </div></div>
          <table style="margin-top:10px"><tr><th></th><th>R1</th><th>R2</th><th>R3</th>${r > 3 ? `<th>Extra</th>` : ''}</tr>
            <tr><td class="muted">Ganador</td>${roundsCells.join('')}</tr></table>
          <p style="margin:10px 0 0">Rounds: ${fighter(b, 'rojo')} <b>${st.wins.rojo}</b> — <b>${st.wins.azul}</b> ${fighter(b, 'azul')}</p>
        </div>
        <div class="card">
          <h3>Puntajes en vivo — round ${r}</h3>
          <table>
            <tr><th></th><th class="txt-rojo">Rojo total</th><th>golpes</th><th class="txt-azul">Azul total</th><th>golpes</th><th>Voto</th></tr>
            ${judgeRows}
          </table>
          <p style="margin:10px 0 0"><b>Resultado parcial:</b> ${rr.winner === 'empate' ? 'Empate' : fighter(b, rr.winner)} <span class="muted">(${esc(rr.reason)})</span></p>
          ${ph === 'revision' ? `
            <div class="row" style="margin-top:10px">
              <div class="grow"><label>Corregir ganador del round (Art. 16.3.4)</label>
                <select id="ovr"><option value="">Usar cálculo automático</option><option value="rojo">Rojo</option><option value="azul">Azul</option><option value="empate">Empate</option></select></div>
              <button class="primary" data-a="announce" style="align-self:flex-end">📣 Anunciar round ${r}</button>
            </div>` : ''}
        </div>
      </div>
      <div class="grid2">${penPanel('rojo')}${penPanel('azul')}</div>
      <div class="grid2">
        <div class="card"><h3>Acciones registradas — round ${r}</h3>
          ${evRound.length ? `<ul class="evlist">${evRound.slice().reverse().map((e) => `<li><span>${fighter(b, e.side)}: ${esc(EVENT_TYPES[e.type]?.label)} <span class="muted">(+${EVENT_TYPES[e.type]?.pts} ${SIDE_LABEL[other(e.side)]})</span></span>
            ${ph !== 'final' ? `<button class="small" data-a="delEv" data-id="${e.id}">✕ anular</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Sin acciones.</p>'}
        </div>
        <div class="card"><h3>Victoria absoluta / término anticipado</h3>
          <div class="row">
            <button data-a="abs" data-k="ko" ${ph === 'final' ? 'disabled' : ''}>KO / 10 s${b.cat.koAllowed ? '' : ' ⚠️'}</button>
            <button data-a="abs" data-k="sup" ${ph === 'final' ? 'disabled' : ''}>Superioridad</button>
            <button data-a="abs" data-k="les" ${ph === 'final' ? 'disabled' : ''}>Lesión / abandono</button>
            <button data-a="abs" data-k="dq" ${ph === 'final' ? 'disabled' : ''}>Descalificación</button>
          </div>
        </div>
      </div>
      <div class="card"><h3>Conexión de jueces de línea (escanear con el celular)</h3>
        <div class="judgelinks">${Array.from({ length: b.judges }, (_, i) => i + 1).map((n) => `
          <div class="card"><b><span class="dot ${judges[n] ? 'on' : ''}"></span>Juez ${n}</b><br>
            <span class="qr">${qrImg(linkFor(`/juez/${b.code}/${n}`))}</span><br>
            <a href="#/juez/${b.code}/${n}" target="_blank" style="font-size:.8rem">abrir enlace</a></div>`).join('')}
        </div>
      </div>
    </div>`;
    const ovr = document.getElementById('ovr');
    if (ovr) { ovr.value = override; ovr.onchange = () => { override = ovr.value; }; }
  }

  const onClick = (e) => {
    const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
    const a = el.dataset.a;
    if (a === 'ev') act.addEvent(el.dataset.side, el.dataset.type);
    else if (a === 'delEv') act.delEvent(el.dataset.id);
    else if (a === 'abs') act.absolute(el.dataset.k);
    else if (a === 'doce') act.finish({ winner: el.dataset.side, reason: 'Victoria absoluta: diferencia de 12 puntos confirmada por todos los jueces' });
    else if (a === 'confirmFinal') { const st = boutStatus(bout); act.finish({ winner: st.winner, reason: st.reason }); }
    else if (a === 'announce') { if (confirm(`¿Anunciar el resultado del round ${bout.round}?`)) act.announce(); }
    else act[a]?.();
  };
  $app.addEventListener('click', onClick);
  cleanup.push(() => $app.removeEventListener('click', onClick));
}

function qrImg(text) {
  try {
    if (!self.qrcode) return '';
    const q = self.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createImgTag(3, 2);
  } catch { return ''; }
}

// ============================================================ JUEZ DE LÍNEA
function judgePick(code) {
  $app.innerHTML = `<div class="wrap"><h1>Combate ${esc(code)}</h1><p>¿Qué juez de línea eres?</p>
    <div class="row">${[1, 2, 3, 4, 5].map((n) => `<a href="#/juez/${esc(code)}/${n}"><button class="primary" style="font-size:1.5rem;padding:18px 26px">${n}</button></a>`).join('')}</div></div>`;
}

function judgeView(code, n) {
  let bout = null, mine = null;
  const undo = []; // pila de toques locales: {round, side}
  const canScore = () => bout && ['combate', 'revision'].includes(bout.phase) && !bout.rounds?.[bout.round];
  const tap = (side) => {
    if (!canScore()) return;
    undo.push({ round: bout.round, side });
    navigator.vibrate?.(30);
    store.tap(code, n, bout.round, side, 1);
  };
  const doUndo = () => {
    const last = undo.pop();
    if (!last || !bout || last.round !== bout.round || !canScore()) return;
    navigator.vibrate?.([20, 40, 20]);
    store.tap(code, n, last.round, last.side, -1);
  };

  function render() {
    if (!bout) { $app.innerHTML = `<div class="wrap"><p>Buscando combate <b>${esc(code)}</b>…</p></div>`; return; }
    if (n > bout.judges) { $app.innerHTML = `<div class="wrap"><p>Este combate tiene solo ${bout.judges} jueces.</p></div>`; return; }
    const r = bout.round;
    const taps = judgeTaps(mine, r);
    const tot = judgeTotals(bout, mine, r);
    const ok = canScore();
    const msg = bout.phase === 'final' ? 'Combate finalizado' : bout.phase === 'descanso' || bout.rounds?.[r] ? `Round ${r} cerrado. Espera el siguiente.` : bout.phase === 'listo' ? `Esperando inicio del round ${r}` : bout.phase === 'cierre' ? 'Combate terminado' : '';
    $app.innerHTML = `
    <div class="judge">
      <header><b>Juez ${n}</b><span>Round ${r} · <span id="jclock">${fmt(remaining(bout.timer))}</span></span><span class="muted">${esc(bout.code)}</span></header>
      <div class="pads">
        ${SIDES.map((s) => `<button class="pad-btn ${s}" data-side="${s}" ${ok ? '' : 'disabled'}>
          <span class="name">${esc(bout[s]?.name || SIDE_LABEL[s])}</span>
          <span class="n">${taps[s]}</span>
          <span class="sub">puntos marcados</span>
          <span class="sub">Total c/penalizaciones: <b>${tot[s]}</b></span>
        </button>`).join('')}
      </div>
      ${ok ? '' : `<div class="locked">${esc(msg)}</div>`}
      <footer><button data-undo ${ok && undo.length ? '' : 'disabled'}>↶ Deshacer último</button></footer>
    </div>`;
  }
  const tick = setInterval(() => { const el = document.getElementById('jclock'); if (el && bout) el.textContent = fmt(remaining(bout.timer)); }, 250);
  cleanup.push(() => clearInterval(tick));
  // pointerdown = respuesta inmediata en celulares (sin el retardo del "click")
  const onDown = (e) => {
    const p = e.target.closest('[data-side]'); if (p && !p.disabled) { e.preventDefault(); tap(p.dataset.side); }
    if (e.target.closest('[data-undo]')) { e.preventDefault(); doUndo(); }
  };
  $app.addEventListener('pointerdown', onDown);
  cleanup.push(() => $app.removeEventListener('pointerdown', onDown));

  store.tap(code, n, 1, 'rojo', 0); // marca al juez como conectado
  cleanup.push(store.watchBout(code, (b) => { bout = b; render(); }));
  cleanup.push(store.watchJudge(code, n, (j) => { mine = j; render(); }));
}

// ========================================================= PANTALLA PÚBLICA
function screenView(code) {
  let bout = null;
  cleanup.push(store.watchBout(code, (b) => { bout = b; render(); }));
  const tick = setInterval(() => { const el = document.getElementById('sclock'); if (el && bout) { const ms = remaining(bout.timer); el.textContent = fmt(ms); el.classList.toggle('low', ms < 10000); } }, 200);
  cleanup.push(() => clearInterval(tick));
  function render() {
    if (!bout) return;
    const b = bout, st = boutStatus(b);
    const last = Object.keys(b.rounds || {}).map(Number).sort((x, y) => y - x)[0];
    const side = (s) => `<div class="fighter ${s}">
      <div class="fname">${esc(b[s]?.name)}</div><div class="fclub">${esc(b[s]?.club || '')}</div>
      <div class="wins">${st.wins[s]}</div>
      <div class="pens">Adv ${warnings(b.events, s)} · Amon ${admonitions(b.events, s)} · Conteos ${counts(b.events, s)}</div></div>`;
    let res = '';
    if (b.phase === 'final' && b.result) res = b.result.winner === 'empate' ? 'EMPATE' : `🏆 GANA ${fighter(b, b.result.winner)}`;
    else if (last && b.rounds[last]) res = `Round ${last}: ${b.rounds[last].winner === 'empate' ? 'Empate' : fighter(b, b.rounds[last].winner)}`;
    $app.innerHTML = `<div class="screen">
      <div class="top"><span>${esc(b.cat.name)}${b.label ? ` · ${esc(b.label)}` : ''}</span><span>Round ${b.round}</span></div>
      <div class="mid">${side('rojo')}<div class="clock"><div class="timer" id="sclock">${fmt(remaining(b.timer))}</div>
        <div class="muted">${b.phase === 'descanso' ? 'Descanso' : ''}</div></div>${side('azul')}</div>
      <div class="result">${res}</div></div>`;
  }
}

route();
