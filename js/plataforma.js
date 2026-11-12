// Mesa central de una plataforma: puestos de jueces, programa y control del combate en curso.
import * as D from './data.js';
import {
  EVENT_TYPES, SIDES, other, judgeTaps, roundResult, twelvePoint, boutStatus, nextRoundAllowed,
  warnings, admonitions, counts, offPlatform,
} from './logic.js';
import { $app, esc, href, topbar, onLeave, fighter, fmt, remaining, uid, SIDE_LABEL, winnerTag } from './ui.js';

const ACTIVE = ['listo', 'combate', 'revision', 'descanso', 'cierre'];

export function plataformaView(tid, p) {
  let t = null, plat = {}, bouts = {}, users = {}, pres = {}, paneles = {}, asig = {};
  let draft = null; // asignación de puestos en edición
  let mesaCode = null, mesaOff = null;

  $app.innerHTML = `<div class="wrap">
    ${topbar(`Mesa · Plataforma ${p}`, `<a class="tag" href="${href(`/pantalla/${tid}/${p}`)}" target="_blank">📺 Pantalla pública ↗</a>`)}
    <p class="muted" id="tname"></p>
    <div id="mesa"></div>
    <div class="grid2"><div class="card" id="puestos"></div><div class="card" id="prog"></div></div>
  </div>`;

  const name = (k) => users[k]?.nombre || D.userOf(k);
  const seats = () => D.toObj(plat.puestos);
  const list = () => Object.entries(bouts).map(([code, b]) => ({ code, ...D.normBout(b) })).filter((b) => b.plataforma === p).sort((a, b) => a.orden - b.orden);
  const current = () => (plat.actual && bouts[plat.actual] ? { code: plat.actual, ...D.normBout(bouts[plat.actual]) } : null);
  const panelByName = (n) => Object.entries(paneles).find(([, x]) => x.nombre.trim().toLowerCase() === String(n || '').trim().toLowerCase());

  // -------------------------------------------------------------- PUESTOS
  function renderPuestos() {
    const el = document.getElementById('puestos');
    const s = draft || seats();
    const cur = current();
    const need = cur?.judges || 5;
    const judges = Object.entries(users).filter(([, u]) => u.activo && u.roles?.juez).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
    const where = (k) => { const a = asig[k]; return a && !(a.torneo === tid && a.plataforma === p) ? ` (en P${a.plataforma})` : ''; };
    const wantPanel = cur?.panel && panelByName(cur.panel);
    el.innerHTML = `<h2>Jueces de línea</h2>
      ${wantPanel && !samePanel(wantPanel[1], s) ? `<div class="banner">Este combate corresponde al <b>${esc(cur.panel)}</b>.
        <button class="small warn" data-loadpanel="${wantPanel[0]}">Cargar ${esc(cur.panel)}</button></div>` : ''}
      <table>${[1, 2, 3, 4, 5].map((n) => `<tr class="${n > need ? 'off' : ''}"><td style="width:70px"><b>Juez ${n}</b></td>
        <td><select data-seat="${n}"><option value="">— vacío —</option>
          ${judges.map(([k, u]) => `<option value="${k}" ${s[n] === k ? 'selected' : ''}>${esc(u.nombre)}${where(k)}</option>`).join('')}</select></td>
        <td style="width:24px"><span class="dot ${s[n] && pres[s[n]] ? 'on' : ''}" data-dotk="${s[n] || ''}" title="Conectado"></span></td></tr>`).join('')}</table>
      ${cur ? `<p class="muted" style="font-size:.85rem">Combate actual: ${cur.judges} jueces${need < 5 ? ` (puestos ${need + 1}-5 no puntúan)` : ''}.</p>` : ''}
      <div class="row" style="margin-top:8px">
        <select id="panelsel" style="max-width:200px"><option value="">Cargar panel…</option>
          ${Object.entries(paneles).map(([id, x]) => `<option value="${id}">${esc(x.nombre)} (${D.toArr(x.miembros).length})</option>`).join('')}</select>
        <span class="grow"></span>
        ${draft ? '<button data-cancel>Cancelar</button><button class="primary" data-saveseats>Guardar asignación</button>' : ''}
      </div>
      <p class="muted" style="font-size:.85rem">Punto verde = el juez tiene la app abierta. Al guardar, su celular cambia solo a este puesto.</p>`;
  }
  const samePanel = (panel, s) => D.toArr(panel.miembros).every((k, i) => s[i + 1] === k);
  const fromPanel = (pid) => { const m = D.toArr(paneles[pid]?.miembros); const s = {}; m.forEach((k, i) => { s[i + 1] = k; }); return s; };

  async function saveSeats(next, { silent } = {}) {
    const vals = Object.values(next).filter(Boolean);
    if (new Set(vals).size !== vals.length) return alert('Un juez no puede estar en dos puestos.');
    const prev = seats(), upd = {};
    const cur = current();
    if (cur && ['combate', 'revision'].includes(cur.phase) && !silent) {
      const changed = [1, 2, 3, 4, 5].some((n) => (prev[n] || '') !== (next[n] || '') && n <= cur.judges);
      if (changed && !confirm('El combate está en curso. ¿Cambiar jueces igual? El juez nuevo continúa la tarjeta del puesto.')) return;
    }
    for (let n = 1; n <= 5; n++) {
      const a = prev[n] || null, b = next[n] || null;
      upd[`plataformas/${tid}/${p}/puestos/${n}`] = b;
      if (a && a !== b && !vals.includes(a)) upd[`asignaciones/${a}`] = null;
      if (b) {
        const old = asig[b];
        if (old && !(old.torneo === tid && old.plataforma === p)) upd[`plataformas/${old.torneo}/${old.plataforma}/puestos/${old.puesto}`] = null;
        upd[`asignaciones/${b}`] = { torneo: tid, plataforma: p, puesto: n };
      }
      if (cur && cur.phase !== 'final') upd[`combates/${cur.code}/puestos/${n}`] = n <= cur.judges ? b : null;
    }
    await D.update(upd);
    draft = null; renderPuestos();
  }

  // ------------------------------------------------------------- PROGRAMA
  function renderProg() {
    const el = document.getElementById('prog');
    const all = list(), cur = current();
    const pend = all.filter((b) => b.phase === 'programado');
    const fin = all.filter((b) => b.phase === 'final');
    el.innerHTML = `<h2>Programa · Plataforma ${p}</h2>
      ${pend.length ? `<button class="primary wide" data-load="${pend[0].code}">⏭ Siguiente: #${pend[0].orden} ${fighter(pend[0], 'rojo')} vs ${fighter(pend[0], 'azul')}</button>` : '<p class="muted">No quedan combates programados.</p>'}
      <div class="table-scroll" style="max-height:340px;overflow:auto;margin-top:8px"><table class="prog">
        ${pend.map((b) => `<tr><td>${b.orden}</td><td style="text-align:left">${fighter(b, 'rojo')} vs ${fighter(b, 'azul')}<br>
          <span class="muted">${esc(b.cat?.name)} ${esc(b.label || '')} · ${b.judges}J${b.panel ? ` · ${esc(b.panel)}` : ''}</span></td>
          <td><button class="small" data-load="${b.code}">Cargar</button><br><button class="small" data-abs="${b.code}">Ausencia</button></td></tr>`).join('')}
      </table></div>
      ${fin.length ? `<details><summary>${fin.length} finalizados</summary><table class="prog">${fin.map((b) => `<tr><td>${b.orden}</td>
        <td style="text-align:left">${fighter(b, 'rojo')} vs ${fighter(b, 'azul')}</td><td>${winnerTag(b.result?.winner)}</td>
        <td><a href="${href(`/acta/${b.code}`)}">Acta</a></td></tr>`).join('')}</table></details>` : ''}`;
  }

  async function loadBout(code) {
    const cur = current();
    if (cur && ACTIVE.includes(cur.phase) && cur.phase !== 'listo' && !confirm('El combate actual no ha terminado. ¿Cambiar de combate igual? (quedará pendiente)')) return;
    const b = D.normBout(bouts[code]);
    let s = seats(), panelLoaded = false;
    const pn = b.panel && panelByName(b.panel);
    if (pn && !samePanel(pn[1], s) && D.toArr(pn[1].miembros).length && confirm(`Este combate es del ${b.panel}. ¿Cargar ese panel en los puestos?`)) { s = fromPanel(pn[0]); panelLoaded = true; }
    const upd = { [`plataformas/${tid}/${p}/actual`]: code };
    if (cur && cur.code !== code && cur.phase !== 'final') upd[`combates/${cur.code}/phase`] = cur.events.length || Object.keys(cur.rounds).length ? cur.phase : 'programado';
    upd[`combates/${code}/phase`] = 'listo';
    upd[`combates/${code}/round`] = 1;
    upd[`combates/${code}/timer`] = { running: false, remaining: b.cat.roundSec * 1000 };
    for (let n = 1; n <= 5; n++) upd[`combates/${code}/puestos/${n}`] = n <= b.judges ? (s[n] || null) : null;
    await D.update(upd);
    if (panelLoaded) await saveSeats(s, { silent: true });
  }

  async function absence(code) {
    const b = D.normBout(bouts[code]);
    const w = prompt(`Ausencia en #${b.orden}: ${b.rojo.name} vs ${b.azul.name}\n¿Quién NO se presentó? Escribe R (rojo) o A (azul):`);
    const abs = /^r/i.test(w || '') ? 'rojo' : /^a/i.test(w || '') ? 'azul' : null;
    if (!abs) return;
    await D.update({ [`combates/${code}/phase`]: 'final', [`combates/${code}/result`]: { winner: other(abs), reason: `Ausencia de ${b[abs].name}`, at: D.now() } });
  }

  // ---------------------------------------------------------------- MESA
  function syncMesa() {
    if (plat.actual === mesaCode) return;
    mesaOff?.(); mesaOff = null; mesaCode = plat.actual || null;
    const el = document.getElementById('mesa');
    if (!mesaCode) { el.innerHTML = '<div class="card"><p class="muted">No hay combate cargado. Usa "Siguiente" en el programa.</p></div>'; return; }
    mesaOff = mesaPanel(el, mesaCode, { name, pres: () => pres });
  }
  onLeave(() => mesaOff?.());

  // ------------------------------------------------------------ DATOS
  onLeave(D.watch(`torneos/${tid}`, (v) => { t = v; document.getElementById('tname').textContent = t ? `${t.nombre}${t.fecha ? ' · ' + t.fecha : ''}` : 'Torneo no encontrado'; }));
  onLeave(D.watch(`plataformas/${tid}/${p}`, (v) => { plat = v || {}; syncMesa(); renderPuestos(); renderProg(); }));
  onLeave(D.watchEq('combates', 'torneo', tid, (v) => { bouts = v; renderProg(); renderPuestos(); }));
  onLeave(D.watch('usuarios', (v) => { users = v || {}; renderPuestos(); }));
  onLeave(D.watch('asignaciones', (v) => { asig = v || {}; renderPuestos(); }));
  onLeave(D.watch(`paneles/${tid}`, (v) => { paneles = v || {}; renderPuestos(); }));
  onLeave(D.watch('presencia', (v) => {
    pres = v || {};
    document.querySelectorAll('[data-dotk]').forEach((d) => d.classList.toggle('on', !!(d.dataset.dotk && pres[d.dataset.dotk])));
  }));

  const onChange = (e) => {
    const el = e.target;
    if (el.dataset.seat) { draft = { ...(draft || seats()), [el.dataset.seat]: el.value || null }; renderPuestos(); }
    if (el.id === 'panelsel' && el.value) { draft = fromPanel(el.value); renderPuestos(); }
  };
  const onClick = (e) => {
    const el = e.target.closest('button'); if (!el) return;
    if (el.dataset.load) loadBout(el.dataset.load);
    if (el.dataset.abs) absence(el.dataset.abs);
    if (el.hasAttribute('data-saveseats')) saveSeats(draft);
    if (el.hasAttribute('data-cancel')) { draft = null; renderPuestos(); }
    if (el.dataset.loadpanel) saveSeats(fromPanel(el.dataset.loadpanel));
  };
  const host = $app.querySelector('.grid2');
  host.addEventListener('change', onChange); host.addEventListener('click', onClick);
}

// =================================================== PANEL DE MESA (combate)
function mesaPanel(root, code, ctx) {
  let bout = null, judges = {}, override = '';
  const offs = [];
  const tick = setInterval(() => {
    if (!bout) return;
    const el = root.querySelector('#clock');
    const ms = remaining(bout.timer);
    if (el) { el.textContent = fmt(ms); el.classList.toggle('low', ms < 10000); }
    if (bout.timer?.running && ms <= 0) {
      if (bout.phase === 'combate') act.endRound();
      else if (bout.phase === 'descanso') save({ timer: { running: false, remaining: 0 } });
    }
  }, 200);
  offs.push(() => clearInterval(tick));
  offs.push(D.watch(`combates/${code}`, (b) => { bout = D.normBout(b); render(); }));
  offs.push(D.watch(`jueces/${code}`, (j) => { judges = D.toObj(j); render(); }));

  const upd = (patch) => D.update(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`combates/${code}/${k}`, v])));
  const save = upd;
  const act = {
    start() { save({ phase: 'combate', timer: { running: true, endsAt: D.now() + bout.cat.roundSec * 1000 } }); },
    pause() { save({ timer: { running: false, remaining: remaining(bout.timer) } }); },
    resume() { save({ timer: { running: true, endsAt: D.now() + remaining(bout.timer) } }); },
    endRound() { save({ phase: 'revision', timer: { running: false, remaining: 0 } }); },
    addEvent(side, type) { save({ events: [...bout.events, { id: uid(), round: bout.round, side, type, t: D.now() }] }); },
    delEvent(id) { save({ events: bout.events.filter((e) => e.id !== id) }); },
    announce() {
      const rr = roundResult(bout, judges, bout.round);
      const winner = override || rr.winner;
      const snap = rr.votes.map((v) => ({ judge: v.judge, u: bout.puestos[v.judge] || null, vote: v.vote, rojo: v.totals.rojo, azul: v.totals.azul }));
      const rounds = { ...bout.rounds, [bout.round]: { winner, reason: override ? 'Corregido por mesa central' : rr.reason, votes: snap } };
      override = '';
      const st = boutStatus({ ...bout, rounds });
      if (st.decided) save({ rounds, phase: 'cierre', timer: { running: false, remaining: 0 } });
      else save({ rounds, phase: 'descanso', timer: { running: true, endsAt: D.now() + bout.cat.restSec * 1000 } });
    },
    nextRound() { save({ round: bout.round + 1, phase: 'listo', timer: { running: false, remaining: bout.cat.roundSec * 1000 } }); },
    finish(result) { save({ result: { ...result, at: D.now() }, phase: 'final', timer: { running: false, remaining: 0 } }); },
    reopen() { if (confirm('¿Reabrir el combate para corregir?')) save({ result: null, phase: 'revision' }); },
    absolute(kind) {
      const labels = { ko: 'KO / no se levanta en 10 s', sup: 'Superioridad declarada por el árbitro', les: 'Lesión / abandono del rival', dq: 'Descalificación del rival' };
      if (kind === 'ko' && !bout.cat.koAllowed && !confirm('El KO NO está permitido en esta categoría (salvo acuerdo previo). ¿Registrar igual?')) return;
      const w = prompt(`${labels[kind]}\n¿Quién GANA? Escribe R (rojo) o A (azul):`);
      const side = /^r/i.test(w || '') ? 'rojo' : /^a/i.test(w || '') ? 'azul' : null;
      if (side) act.finish({ winner: side, reason: `Victoria absoluta: ${labels[kind]}` });
    },
  };

  function render() {
    if (!bout) { root.innerHTML = '<div class="card muted">Cargando combate…</div>'; return; }
    const b = bout, r = b.round, ph = b.phase;
    const st = boutStatus(b);
    const rr = roundResult(b, judges, r);
    const doce = twelvePoint(b, judges, r);
    const live = ['combate', 'revision'].includes(ph);
    const evRound = b.events.filter((e) => e.round === r);
    const phaseTxt = { programado: 'Programado', listo: `Listo para round ${r}`, combate: b.timer?.running ? `Round ${r} en curso` : `Round ${r} detenido`, revision: `Revisión del round ${r}`, descanso: `Descanso — próximo round ${r + 1}`, cierre: 'Combate terminado: confirmar resultado', final: 'Combate finalizado' }[ph];

    let banner = '';
    if (ph === 'final' && b.result) banner = `<div class="banner final"><b>Resultado:</b> ${b.result.winner === 'empate' ? 'EMPATE' : `GANA ${fighter(b, b.result.winner)}`} — ${esc(b.result.reason)}
      <a href="${href(`/acta/${code}`)}" class="tag">Ver acta</a> <button class="small" data-a="reopen">Reabrir</button></div>`;
    else if (st.decided) banner = `<div class="banner"><b>${st.auto ? '⚠️ ' : ''}${st.winner === 'empate' ? 'EMPATE' : `Gana ${fighter(b, st.winner)}`}</b> — ${esc(st.reason)}
      <button class="primary small" data-a="confirmFinal">Confirmar y cerrar combate</button></div>`;
    else if (st.needExtra && ph === 'descanso') banner = `<div class="banner">${esc(st.reason)}</div>`;
    if (doce && live) banner += `<div class="banner">⚠️ Todos los jueces marcan 12+ puntos de diferencia a favor de ${fighter(b, doce)}.
      <button class="warn small" data-a="doce" data-side="${doce}">Declarar victoria absoluta</button></div>`;

    const judgeRows = rr.votes.map((v) => {
      const taps = judgeTaps(judges[v.judge], r);
      const k = b.puestos[v.judge];
      return `<tr><td style="text-align:left"><span class="dot ${k && ctx.pres()[k] ? 'on' : ''}" data-dotk="${k || ''}"></span>J${v.judge} <span class="muted">${k ? esc(ctx.name(k)) : '<i>sin juez</i>'}</span></td>
        <td class="big txt-rojo">${v.totals.rojo}</td><td class="muted">${taps.rojo}</td>
        <td class="big txt-azul">${v.totals.azul}</td><td class="muted">${taps.azul}</td>
        <td>${winnerTag(v.vote)}${v.why !== 'puntos' ? `<br><span class="muted" style="font-size:.75rem">${esc(v.why)}</span>` : ''}</td></tr>`;
    }).join('');

    const roundsCols = [...new Set([1, 2, 3, ...(r > 3 ? [r] : [])])];
    const penPanel = (s) => `
      <div class="card side-${s}" style="margin:0">
        <h3>${fighter(b, s)} <span class="muted">comete / recibe</span></h3>
        <div class="pen-grid">
          ${Object.entries(EVENT_TYPES).filter(([k]) => k !== 'exceso' || b.cat.excessContact).map(([k, tp]) =>
            `<button data-a="ev" data-side="${s}" data-type="${k}" ${live ? '' : 'disabled'}>${esc(tp.label)}<br><span class="muted">${esc(tp.help)}</span></button>`).join('')}
        </div>
        <p class="muted" style="font-size:.85rem;margin:8px 0 0">Combate: Adv ${warnings(b.events, s)} · Amon ${admonitions(b.events, s)} · Conteos ${counts(b.events, s)} · Salidas (round) ${offPlatform(b.events, s, r)}</p>
      </div>`;

    root.innerHTML = `
      <div class="card fightinfo"><div class="row"><h2 class="grow" style="margin:0">#${b.orden ?? ''} ${fighter(b, 'rojo')} <span class="muted">vs</span> ${fighter(b, 'azul')}</h2>
        <span class="tag">${esc(b.cat.name)}</span>${b.label ? `<span class="tag">${esc(b.label)}</span>` : ''}<span class="tag">${b.judges} jueces</span>
        <span class="tag">${b.system === 'todos' ? 'Todos c/ todos' : 'Eliminación'}</span>${b.cat.koAllowed ? '' : '<span class="tag">KO no permitido</span>'}</div>
        <p class="muted" style="margin:6px 0 0;font-size:.9rem">${esc(b.cat.notes)}</p></div>
      ${banner}
      <div class="grid2">
        <div class="card">
          <div class="row"><div class="grow"><h3>${phaseTxt}</h3><div class="timer" id="clock">${fmt(remaining(b.timer))}</div></div>
            <div class="row">
              ${ph === 'listo' ? `<button class="primary" data-a="start">▶ Iniciar round ${r}</button>` : ''}
              ${ph === 'combate' && b.timer?.running ? '<button class="warn" data-a="pause">⏸ Detener</button>' : ''}
              ${ph === 'combate' && !b.timer?.running ? '<button class="primary" data-a="resume">▶ Reanudar</button>' : ''}
              ${ph === 'combate' ? '<button data-a="endRound">Fin del round</button>' : ''}
              ${ph === 'descanso' && nextRoundAllowed(b) ? `<button class="primary" data-a="nextRound">Preparar round ${r + 1}</button>` : ''}
            </div></div>
          <table style="margin-top:10px"><tr><th></th>${roundsCols.map((n) => `<th>${n > 3 ? 'Extra' : 'R' + n}</th>`).join('')}</tr>
            <tr><td class="muted">Ganador</td>${roundsCols.map((n) => `<td>${b.rounds[n] ? winnerTag(b.rounds[n].winner) : n === r && ph !== 'final' ? '<span class="muted">en curso</span>' : '—'}</td>`).join('')}</tr></table>
          <p style="margin:10px 0 0">Rounds: ${fighter(b, 'rojo')} <b>${st.wins.rojo}</b> — <b>${st.wins.azul}</b> ${fighter(b, 'azul')}</p>
        </div>
        <div class="card">
          <h3>Puntajes en vivo — round ${r}</h3>
          <table><tr><th></th><th class="txt-rojo">Rojo</th><th>golpes</th><th class="txt-azul">Azul</th><th>golpes</th><th>Voto</th></tr>${judgeRows}</table>
          <p style="margin:10px 0 0"><b>Resultado parcial:</b> ${rr.winner === 'empate' ? 'Empate' : fighter(b, rr.winner)} <span class="muted">(${esc(rr.reason)})</span></p>
          ${ph === 'revision' ? `<div class="row" style="margin-top:10px">
              <div class="grow"><label>Corregir ganador del round (Art. 16.3.4)</label>
                <select id="ovr"><option value="">Usar cálculo automático</option><option value="rojo">Rojo</option><option value="azul">Azul</option><option value="empate">Empate</option></select></div>
              <button class="primary" data-a="announce" style="align-self:flex-end">📣 Anunciar round ${r}</button></div>` : ''}
        </div>
      </div>
      <div class="grid2">${penPanel('rojo')}${penPanel('azul')}</div>
      <div class="grid2">
        <div class="card"><h3>Acciones registradas — round ${r}</h3>
          ${evRound.length ? `<ul class="evlist">${evRound.slice().reverse().map((e) => `<li><span>${fighter(b, e.side)}: ${esc(EVENT_TYPES[e.type]?.label)} <span class="muted">(+${EVENT_TYPES[e.type]?.pts} ${SIDE_LABEL[other(e.side)]})</span></span>
            ${ph !== 'final' ? `<button class="small" data-a="delEv" data-id="${e.id}">✕ anular</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Sin acciones.</p>'}
        </div>
        <div class="card"><h3>Victoria absoluta / término anticipado</h3><div class="row">
          ${[['ko', `KO / 10 s${b.cat.koAllowed ? '' : ' ⚠️'}`], ['sup', 'Superioridad'], ['les', 'Lesión / abandono'], ['dq', 'Descalificación']].map(([k, l]) =>
            `<button data-a="abs" data-k="${k}" ${ph === 'final' || ph === 'programado' ? 'disabled' : ''}>${l}</button>`).join('')}
        </div></div>
      </div>`;
    const ovr = root.querySelector('#ovr');
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
  root.addEventListener('click', onClick);
  offs.push(() => root.removeEventListener('click', onClick));
  return () => offs.forEach((f) => f());
}
