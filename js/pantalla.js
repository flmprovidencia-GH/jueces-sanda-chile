// Pantalla pública por plataforma (sin usuario) y acta imprimible de un combate.
import * as D from './data.js';
import { boutStatus, warnings, admonitions, counts, EVENT_TYPES, SIDES } from './logic.js';
import { $app, esc, fmt, remaining, onLeave, fighter, topbar, winnerTag, SIDE_LABEL, href } from './ui.js';

export function screenView(tid, p) {
  let bout = null, offB = null, code = null;
  onLeave(D.watch(`plataformas/${tid}/${p}/actual`, (c) => {
    if (c === code) return; code = c; offB?.(); bout = null;
    offB = c ? D.watch(`combates/${c}`, (b) => { bout = D.normBout(b); render(); }) : null;
    render();
  }));
  onLeave(() => offB?.());
  const tick = setInterval(() => {
    const el = document.getElementById('sclock');
    if (el && bout) { const ms = remaining(bout.timer); el.textContent = fmt(ms); el.classList.toggle('low', ms < 10000); }
  }, 200);
  onLeave(() => clearInterval(tick));
  function render() {
    if (!bout) { $app.innerHTML = `<div class="screen"><div></div><div class="center"><h1 style="font-size:6vh">Plataforma ${p}</h1><p class="muted" style="font-size:3vh">Esperando combate…</p></div><div></div></div>`; return; }
    const b = bout, st = boutStatus(b);
    const last = Object.keys(b.rounds).map(Number).sort((x, y) => y - x)[0];
    const side = (s) => `<div class="fighter ${s}">
      <div class="fname">${esc(b[s]?.name)}</div><div class="fclub">${esc(b[s]?.club || '')}</div>
      <div class="wins">${st.wins[s]}</div>
      <div class="pens">Adv ${warnings(b.events, s)} · Amon ${admonitions(b.events, s)} · Conteos ${counts(b.events, s)}</div></div>`;
    let res = '';
    if (b.phase === 'final' && b.result) res = b.result.winner === 'empate' ? 'EMPATE' : `🏆 GANA ${fighter(b, b.result.winner)}`;
    else if (last && b.rounds[last]) res = `Round ${last}: ${b.rounds[last].winner === 'empate' ? 'Empate' : fighter(b, b.rounds[last].winner)}`;
    $app.innerHTML = `<div class="screen">
      <div class="top"><span>Plataforma ${p} · #${b.orden ?? ''} · ${esc(b.cat.name)}${b.label ? ` · ${esc(b.label)}` : ''}</span><span>Round ${b.round}</span></div>
      <div class="mid">${side('rojo')}<div class="clock"><div class="timer" id="sclock">${fmt(remaining(b.timer))}</div>
        <div class="muted" style="font-size:2.5vh">${b.phase === 'descanso' ? 'Descanso' : ''}</div></div>${side('azul')}</div>
      <div class="result">${res}</div></div>`;
  }
}

export function actaView(code) {
  let b = null, judges = {}, users = {}, t = null;
  const render = () => {
    if (!b) { $app.innerHTML = `<div class="wrap">${topbar('Acta')}<p class="muted">Cargando…</p></div>`; return; }
    const name = (k) => (k ? users[k]?.nombre || D.userOf(k) : '—');
    const st = boutStatus(b);
    const rounds = Object.keys(b.rounds).map(Number).sort((x, y) => x - y);
    $app.innerHTML = `<div class="wrap acta">
      <div class="noprint">${topbar('Acta de combate', '<button class="primary small" onclick="print()">🖨 Imprimir / PDF</button>')}</div>
      <div class="card">
        <h2>${esc(t?.nombre || '')} — Plataforma ${b.plataforma ?? ''} · Combate #${b.orden ?? ''}</h2>
        <p>${esc(b.cat.name)}${b.label ? ` · ${esc(b.label)}` : ''} · ${b.judges} jueces · ${b.system === 'todos' ? 'Todos contra todos' : 'Eliminación'} · Código ${esc(code)}</p>
        <table><tr><th></th><th>Competidor</th><th>Club</th><th>Peso</th><th>Rounds</th><th>Adv</th><th>Amon</th><th>Conteos</th></tr>
          ${SIDES.map((s) => `<tr><td>${winnerTag(s)}</td><td>${esc(b[s].name)}</td><td>${esc(b[s].club || '')}</td><td>${b[s].weight ?? ''}</td>
            <td><b>${st.wins[s]}</b></td><td>${warnings(b.events, s)}</td><td>${admonitions(b.events, s)}</td><td>${counts(b.events, s)}</td></tr>`).join('')}</table>
        <p><b>Juez de plataforma:</b> ${esc(b.arbitro ? name(b.arbitro) : '—')} · <b>Mesa central:</b> ${esc(b.mesa ? name(b.mesa) : '—')}</p>
        <p style="font-size:1.1rem"><b>Resultado:</b> ${b.result ? (b.result.winner === 'empate' ? 'EMPATE' : `Gana ${fighter(b, b.result.winner)}`) + ` — ${esc(b.result.reason)}` : 'Sin terminar'}</p>
      </div>
      ${rounds.map((n) => { const rd = b.rounds[n]; return `<div class="card"><h3>Round ${n > 3 ? 'extra' : n}: ${winnerTag(rd.winner)} <span class="muted">${esc(rd.reason || '')}</span></h3>
        <table><tr><th>Puesto</th><th>Juez</th><th class="txt-rojo">Rojo</th><th class="txt-azul">Azul</th><th>Voto</th></tr>
        ${D.toArr(rd.votes).map((v) => `<tr><td>J${v.judge}</td><td>${esc(name(v.u))}</td><td>${v.rojo}</td><td>${v.azul}</td><td>${winnerTag(v.vote)}</td></tr>`).join('')}</table>
        <p class="muted" style="font-size:.85rem">Acciones de mesa: ${b.events.filter((e) => e.round === n).map((e) => `${esc(b[e.side].name)}: ${esc(EVENT_TYPES[e.type]?.label)}`).join(' · ') || 'ninguna'}</p></div>`; }).join('')}
      <div class="card"><h3>Firmas</h3><div class="firmas">
        ${Object.entries(b.puestos).map(([n, k]) => `<div>______________________<br>J${n} ${esc(name(k))}</div>`).join('')}
        <div>______________________<br>Juez de plataforma${b.arbitro ? ` ${esc(name(b.arbitro))}` : ''}</div>
        <div>______________________<br>Juez principal${b.mesa ? ` ${esc(name(b.mesa))}` : ''}</div></div></div>
    </div>`;
  };
  onLeave(D.watch(`combates/${code}`, (v) => {
    b = D.normBout(v); render();
    if (b?.torneo && !t) D.get(`torneos/${b.torneo}`).then((x) => { t = x; render(); });
  }));
  onLeave(D.watch(`jueces/${code}`, (v) => { judges = D.toObj(v); render(); }));
  onLeave(D.watch('usuarios', (v) => { users = v || {}; render(); }));
}

// Resultados para premiación: resumen simple por categoría y división, en vivo e imprimible (sin usuario).
export function resultsView(tid) {
  let t = null, bouts = {}, onlyFinals = false;
  const ORDER = { infantil: 1, juvenil: 2, light: 3, oficial: 4, superlucha: 5 };
  const short = (b) => {
    const r = b.result?.reason || '';
    if (/Ausencia/i.test(r)) return 'No presentación';
    if (/Descalificaci/i.test(r)) return 'Descalificación';
    if (/KO/i.test(r)) return 'KO';
    if (/Superioridad/i.test(r)) return 'Superioridad';
    if (/12 puntos/i.test(r)) return 'Dif. 12 puntos';
    if (/conteos/i.test(r)) return '3 conteos';
    if (/Lesi/i.test(r)) return 'Lesión / abandono';
    const st = boutStatus(b); const w = b.result?.winner;
    return w === 'empate' ? `Empate ${st.wins.rojo}-${st.wins.azul}` : `${st.wins[w]}-${st.wins[w === 'rojo' ? 'azul' : 'rojo']} en rounds`;
  };
  const who = (s) => `<b>${esc(s?.name || '')}</b>${s?.club ? ` <span class="muted">(${esc(s.club)})</span>` : ''}`;
  function render() {
    const all = Object.entries(bouts).map(([code, b]) => ({ code, ...D.normBout(b) }));
    const fin = all.filter((b) => b.phase === 'final' && b.result?.winner).filter((b) => !onlyFinals || /final/i.test(b.label || '') && !/semi|cuarto|octavo/i.test(b.label || ''));
    const groups = {};
    for (const b of fin) {
      const div = String(b.label || '').split(' · ')[0] || 'Sin división';
      const k = `${ORDER[b.cat?.key] || 9}|${b.cat?.name}|${div}`;
      (groups[k] ||= []).push(b);
    }
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const pend = all.filter((b) => b.phase !== 'final').length;
    $app.innerHTML = `<div class="wrap results">
      <div class="noprint row" style="margin-bottom:12px"><a href="${href('/')}">🥋 Inicio</a><span class="grow"></span>
        <label class="check"><input type="checkbox" id="onlyf" ${onlyFinals ? 'checked' : ''}> Solo finales</label>
        <button class="primary" onclick="print()">🖨 Imprimir / PDF</button></div>
      <h1>🏆 ${esc(t?.nombre || 'Resultados')}</h1>
      <p class="muted">${t?.fecha ? esc(t.fecha) + ' · ' : ''}Resultados al ${new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
        · ${fin.length} combates terminados${pend ? ` · ${pend} pendientes` : ''}</p>
      ${keys.length ? keys.map((k) => { const [, cat, div] = k.split('|'); const list = groups[k].sort((a, b) => a.plataforma - b.plataforma || a.orden - b.orden);
        return `<div class="card res-group"><h2>${esc(cat)} · ${esc(div)}</h2><table>
          <tr><th style="width:18%">Fase</th><th style="text-align:left">Ganador</th><th style="text-align:left">Perdedor</th><th style="width:18%">Resultado</th></tr>
          ${list.map((b) => { const w = b.result.winner, l = w === 'rojo' ? 'azul' : 'rojo';
            const fase = String(b.label || '').split(' · ')[1] || `Combate #${b.orden}`;
            return w === 'empate'
              ? `<tr><td>${esc(fase)}</td><td style="text-align:left">${who(b.rojo)}</td><td style="text-align:left">${who(b.azul)}</td><td>${esc(short(b))}</td></tr>`
              : `<tr><td>${esc(fase)}</td><td style="text-align:left">🥇 ${who(b[w])}</td><td style="text-align:left">${who(b[l])}</td><td>${esc(short(b))}</td></tr>`; }).join('')}
        </table></div>`; }).join('') : '<div class="card"><p class="muted">Aún no hay combates terminados.</p></div>'}
    </div>`;
    const cb = document.getElementById('onlyf'); if (cb) cb.onchange = () => { onlyFinals = cb.checked; render(); };
  }
  onLeave(D.watch(`torneos/${tid}`, (v) => { t = v; render(); }));
  onLeave(D.watchEq('combates', 'torneo', tid, (v) => { bouts = v; render(); }));
}
