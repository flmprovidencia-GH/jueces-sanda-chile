// Juez de línea: espera su asignación y luego puntúa el combate actual de su plataforma.
import * as D from './data.js';
import { judgeTaps, judgeTotals, SIDES } from './logic.js';
import { $app, esc, fmt, remaining, onLeave, SIDE_LABEL } from './ui.js';

export function judgeView() {
  const me = D.currentProfile();
  let asg = null, code = null, bout = null, mine = null, plat = null;
  let offPlat = null, offBout = null, offMine = null;
  let undo = [];

  const canScore = () => bout && asg && bout.puestos?.[asg.puesto] === me.key && asg.puesto <= bout.judges
    && ['combate', 'revision'].includes(bout.phase) && !bout.rounds?.[bout.round];

  function follow() {
    offPlat?.(); offPlat = null;
    if (!asg) { setCode(null); render(); return; }
    offPlat = D.watch(`plataformas/${asg.torneo}/${asg.plataforma}/actual`, (c) => setCode(c || null));
  }
  function setCode(c) {
    if (c === code) return;
    offBout?.(); offMine?.(); offBout = offMine = null;
    code = c; bout = null; mine = null; undo = [];
    if (code) {
      offBout = D.watch(`combates/${code}`, (b) => { bout = D.normBout(b); render(); });
      offMine = D.watch(`jueces/${code}/${asg.puesto}`, (j) => { mine = j && { ...j, taps: D.toObj(j.taps) }; render(); });
    }
    render();
  }
  onLeave(D.watch(`asignaciones/${me.key}`, (a) => {
    const changed = JSON.stringify(a) !== JSON.stringify(asg);
    asg = a; if (changed) { code = undefined; follow(); }
  }));
  onLeave(() => { offPlat?.(); offBout?.(); offMine?.(); });

  const tap = (side) => {
    if (!canScore()) return;
    undo.push({ round: bout.round, side });
    navigator.vibrate?.(30);
    D.update({ [`jueces/${code}/${asg.puesto}/taps/${bout.round}/${side}`]: D.inc(1), [`jueces/${code}/${asg.puesto}/at`]: D.serverTime() });
    render();
  };
  const doUndo = () => {
    const last = undo.pop();
    if (!last || last.round !== bout?.round || !canScore()) { render(); return; }
    navigator.vibrate?.([20, 40, 20]);
    D.update({ [`jueces/${code}/${asg.puesto}/taps/${last.round}/${last.side}`]: D.inc(-1) });
    render();
  };

  const wait = (title, sub) => {
    $app.innerHTML = `<div class="wrap narrow center" style="padding-top:10vh">
      <h1>Hola ${esc(me.nombre?.split(' ')[0] || '')} 👋</h1><p style="font-size:1.2rem">${title}</p>
      ${sub ? `<p class="muted">${sub}</p>` : ''}<span class="dot on"></span> <span class="muted">Conectado</span>
      <p style="margin-top:30px"><button data-logout>Salir</button></p></div>`;
  };

  function render() {
    if (!asg) return wait('Esperando que la mesa central te asigne un puesto…', 'Deja esta pantalla abierta. Cambiará sola.');
    if (!code) return wait(`Plataforma ${asg.plataforma} · Juez ${asg.puesto}`, 'Esperando el próximo combate…');
    if (!bout) return wait('Cargando combate…');
    if (asg.puesto > bout.judges) return wait(`Plataforma ${asg.plataforma} · Juez ${asg.puesto}`, `Este combate usa ${bout.judges} jueces: no puntúas en este.`);
    if (bout.puestos?.[asg.puesto] !== me.key) return wait(`Plataforma ${asg.plataforma} · Juez ${asg.puesto}`, 'La mesa aún no confirma tu puesto en este combate.');
    const r = bout.round, taps = judgeTaps(mine, r), tot = judgeTotals(bout, mine, r), ok = canScore();
    const msg = bout.phase === 'final' || bout.phase === 'cierre' ? 'Combate finalizado. Espera el siguiente.' : bout.phase === 'descanso' || bout.rounds?.[r] ? `Round ${r} cerrado. Espera el siguiente.` : `Esperando inicio del round ${r}`;
    $app.innerHTML = `
    <div class="judge">
      <header><b>P${asg.plataforma} · Juez ${asg.puesto}</b><span>Round ${r} · <span id="jclock">${fmt(remaining(bout.timer))}</span></span><span class="muted">#${bout.orden ?? ''}</span></header>
      <div class="pads">
        ${SIDES.map((s) => `<button class="pad-btn ${s}" data-side="${s}" ${ok ? '' : 'disabled'}>
          <span class="name">${esc(bout[s]?.name || SIDE_LABEL[s])}</span>
          <span class="n">${taps[s]}</span><span class="sub">puntos marcados</span>
          <span class="sub">Total c/penalizaciones: <b>${tot[s]}</b></span></button>`).join('')}
      </div>
      ${ok ? '' : `<div class="locked">${esc(msg)}</div>`}
      <footer><button data-undo ${ok && undo.length ? '' : 'disabled'}>↶ Deshacer último</button><button data-logout class="small" style="flex:0 0 auto">Salir</button></footer>
    </div>`;
  }
  const tick = setInterval(() => { const el = document.getElementById('jclock'); if (el && bout) el.textContent = fmt(remaining(bout.timer)); }, 250);
  onLeave(() => clearInterval(tick));
  const onDown = (e) => {
    const p = e.target.closest('[data-side]'); if (p && !p.disabled) { e.preventDefault(); tap(p.dataset.side); }
    if (e.target.closest('[data-undo]')) { e.preventDefault(); doUndo(); }
  };
  $app.addEventListener('pointerdown', onDown);
  onLeave(() => $app.removeEventListener('pointerdown', onDown));
  render();
}
