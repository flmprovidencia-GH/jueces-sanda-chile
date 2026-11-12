// Administración de un torneo: datos, paneles de jueces, programa (desde Google Sheets) y resultados.
import * as D from './data.js';
import { CATEGORIES, boutStatus } from './logic.js';
import { parseProgram, TEMPLATE_HEADERS } from './program.js';
import { $app, esc, href, topbar, onLeave, fighter, genCode, downloadFile, csvRow, SIDE_LABEL } from './ui.js';

const PHASE_TXT = { programado: 'Programado', listo: 'En plataforma', combate: 'En curso', revision: 'En curso', descanso: 'En curso', cierre: 'Por cerrar', final: 'Finalizado' };

export function torneoView(tid) {
  let t = null, paneles = {}, bouts = {}, users = {}, preview = null, pasteText = '', csvUrl = '';
  $app.innerHTML = `<div class="wrap">${topbar('Torneo')}<div id="body" class="muted">Cargando…</div></div>`;

  const jueces = () => Object.entries(users).filter(([, u]) => u.activo && u.roles?.juez).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));

  function render() {
    if (!t) { document.getElementById('body').innerHTML = 'Torneo no encontrado.'; return; }
    const list = Object.entries(bouts).map(([code, b]) => ({ code, ...D.normBout(b) })).sort((a, b) => a.plataforma - b.plataforma || a.orden - b.orden);
    const plats = Array.from({ length: t.plataformas || 1 }, (_, i) => i + 1);
    const done = list.filter((b) => b.phase === 'final').length;
    document.getElementById('body').innerHTML = `
      <form class="card" id="tf"><h2>Datos del torneo</h2><div class="row">
        <div class="grow"><label>Nombre</label><input name="nombre" value="${esc(t.nombre)}"></div>
        <div><label>Fecha</label><input name="fecha" type="date" value="${esc(t.fecha || '')}"></div>
        <div style="width:150px"><label>Plataformas</label><select name="plataformas">${[1, 2, 3].map((n) => `<option ${n === t.plataformas ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <button class="primary" style="align-self:flex-end">Guardar</button></div>
        <div class="row" style="margin-top:12px">
          ${plats.map((n) => `<a href="${href(`/plataforma/${tid}/${n}`)}"><button type="button">🖥 Mesa plataforma ${n}</button></a>
            <a href="${href(`/pantalla/${tid}/${n}`)}" target="_blank"><button type="button" class="small">📺 Pantalla ${n}</button></a>`).join('')}
        </div></form>

      <div class="card"><h2>Paneles de jueces</h2>
        <p class="muted" style="font-size:.9rem">Grupos que rotan. En el programa, la columna "Panel" indica qué panel juzga cada combate;
          la mesa lo carga con un clic.</p>
        ${Object.entries(paneles).map(([pid, p]) => `<div class="panel-row">
          <b>${esc(p.nombre)}</b>
          <div class="chips">${jueces().map(([k, u]) => `<label class="chip"><input type="checkbox" data-pm="${pid}" data-k="${k}" ${D.toArr(p.miembros).includes(k) ? 'checked' : ''}> ${esc(u.nombre)}</label>`).join('') || '<span class="muted">No hay jueces creados.</span>'}</div>
          <span class="muted">${D.toArr(p.miembros).length} integrantes · el orden de selección define Juez 1, 2, 3…</span>
          <button class="small" style="align-self:flex-start" data-delpanel="${pid}">Eliminar panel</button></div>`).join('') || '<p class="muted">Sin paneles.</p>'}
        <div class="row"><input id="pname" placeholder="Nombre del panel (ej. Panel A)" style="max-width:260px"><button id="addp">Agregar panel</button></div>
      </div>

      <div class="card"><h2>Programa de combates</h2>
        <details ${list.length && !preview ? '' : 'open'}><summary><b>Importar desde Google Sheets</b></summary>
          <ol class="muted" style="font-size:.9rem">
            <li>Descarga la <a href="#" id="tpl">plantilla</a> y ábrela en Google Sheets (Archivo → Importar), o usa tu planilla con los mismos títulos.</li>
            <li>Selecciona toda la tabla (incluida la fila de títulos), cópiala (Ctrl+C) y pégala abajo (Ctrl+V).</li>
            <li>Revisa la vista previa e importa. Los combates ya iniciados o terminados no se tocan.</li>
          </ol>
          <p class="muted" style="font-size:.85rem">Columnas: ${TEMPLATE_HEADERS.join(' · ')}. Obligatorias: Plataforma, Rojo y Azul.
            Categoría: Infantil, Juvenil, Adulto light, Adulto oficial o Super lucha.</p>
          <textarea id="paste" rows="6" placeholder="Pega aquí la tabla copiada desde Google Sheets…"></textarea>
          <div class="row" style="margin-top:8px"><span class="muted">o enlace CSV publicado:</span>
            <input id="csvurl" class="grow" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"><button id="fetchcsv">Cargar</button></div>
          <div id="prev"></div>
        </details>
        <div class="row" style="margin:12px 0"><b>${list.length}</b> combates · ${done} finalizados
          <span class="grow"></span><button class="small" id="csv">⬇ Descargar resultados (CSV)</button></div>
        ${plats.map((n) => {
          const pl = list.filter((b) => b.plataforma === n);
          return `<h3>Plataforma ${n} <span class="muted">(${pl.length})</span></h3>${pl.length ? `<div class="table-scroll"><table class="prog">
            <tr><th>#</th><th style="text-align:left">Combate</th><th>Categoría</th><th>Panel</th><th>Estado</th><th></th></tr>
            ${pl.map((b) => `<tr><td>${b.orden}</td>
              <td style="text-align:left">${fighter(b, 'rojo')} vs ${fighter(b, 'azul')}<br><span class="muted">${esc(b.label || '')}</span></td>
              <td>${esc(b.cat?.name)} · ${b.judges}J</td><td>${esc(b.panel || '')}</td>
              <td>${b.phase === 'final' ? (b.result?.winner === 'empate' ? 'Empate' : `Gana ${fighter(b, b.result?.winner)}`) : PHASE_TXT[b.phase] || b.phase}</td>
              <td>${b.phase === 'final' ? `<a href="${href(`/acta/${b.code}`)}">Acta</a>` : b.phase === 'programado' ? `<button class="small" data-delb="${b.code}">✕</button>` : ''}</td></tr>`).join('')}
            </table></div>` : '<p class="muted">Sin combates.</p>'}`;
        }).join('')}
      </div>`;
    document.getElementById('paste').value = pasteText;
    document.getElementById('csvurl').value = csvUrl;
    renderPreview();
  }

  function renderPreview() {
    const el = document.getElementById('prev'); if (!el) return;
    if (!preview) { el.innerHTML = ''; return; }
    const { bouts: bs, errors } = preview;
    el.innerHTML = `<div class="card" style="margin-top:10px">
      ${errors.length ? `<div class="banner"><b>Revisa estos problemas:</b><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      <p><b>${bs.length}</b> combates leídos: ${[1, 2, 3].map((n) => `P${n}: ${bs.filter((b) => b.plataforma === n).length}`).join(' · ')}</p>
      <div class="table-scroll"><table><tr><th>#</th><th>P</th><th>Categoría</th><th style="text-align:left">Rojo</th><th style="text-align:left">Azul</th><th>Jueces</th><th>Panel</th></tr>
      ${bs.slice(0, 12).map((b) => `<tr><td>${b.orden}</td><td>${b.plataforma}</td><td>${esc(CATEGORIES[b.catKey].name)} ${esc(b.division)}</td>
        <td style="text-align:left">${esc(b.rojo.name)}</td><td style="text-align:left">${esc(b.azul.name)}</td><td>${b.judges}</td><td>${esc(b.panel)}</td></tr>`).join('')}
      </table></div>${bs.length > 12 ? `<p class="muted">… y ${bs.length - 12} más</p>` : ''}
      <button class="primary" id="doimport" ${errors.length || !bs.length ? 'disabled' : ''}>Importar ${bs.length} combates</button>
      <span class="muted" style="font-size:.85rem"> Reemplaza los combates "Programado" actuales.</span></div>`;
  }

  async function doImport() {
    const upd = {};
    for (const [code, b] of Object.entries(bouts)) if (b.phase === 'programado') upd[`combates/${code}`] = null;
    for (const b of preview.bouts) {
      const cat = { key: b.catKey, ...CATEGORIES[b.catKey], koAllowed: b.koAllowed };
      upd[`combates/${genCode()}`] = {
        torneo: tid, plataforma: b.plataforma, orden: b.orden, panel: b.panel || '',
        label: [b.division, b.fase].filter(Boolean).join(' · '), cat, system: b.system, judges: b.judges,
        rojo: b.rojo, azul: b.azul, round: 1, phase: 'programado', timer: { running: false, remaining: cat.roundSec * 1000 }, createdAt: D.now(),
      };
    }
    await D.update(upd);
    // Crea los paneles mencionados que aún no existen.
    const names = new Set(Object.values(paneles).map((p) => p.nombre.trim().toLowerCase()));
    const newP = {};
    preview.bouts.forEach((b) => { const n = b.panel.trim(); if (n && !names.has(n.toLowerCase())) { names.add(n.toLowerCase()); newP[`paneles/${tid}/${D.newKey(`paneles/${tid}`)}`] = { nombre: n, miembros: [] }; } });
    if (Object.keys(newP).length) await D.update(newP);
    preview = null; pasteText = ''; document.getElementById('paste').value = ''; renderPreview();
    alert('Programa importado.');
  }

  function exportCsv() {
    const list = Object.entries(bouts).map(([code, b]) => ({ code, ...D.normBout(b) })).sort((a, b) => a.plataforma - b.plataforma || a.orden - b.orden);
    const name = (k) => users[k]?.nombre || D.userOf(k);
    const rows = [csvRow(['Plataforma', 'Orden', 'Código', 'Categoría', 'División/Fase', 'Rojo', 'Club rojo', 'Azul', 'Club azul', 'Ganador', 'Nombre ganador', 'Motivo', 'Rounds rojo', 'Rounds azul', 'R1', 'R2', 'R3', 'Jueces'])];
    for (const b of list) {
      const st = boutStatus(b);
      const w = b.result?.winner;
      rows.push(csvRow([b.plataforma, b.orden, b.code, b.cat?.name, b.label, b.rojo?.name, b.rojo?.club, b.azul?.name, b.azul?.club,
        w ? SIDE_LABEL[w] : '', w && w !== 'empate' ? b[w]?.name : '', b.result?.reason || (b.phase === 'final' ? '' : 'Sin terminar'),
        st.wins.rojo, st.wins.azul, ...[1, 2, 3].map((n) => (b.rounds[n] ? SIDE_LABEL[b.rounds[n].winner] : '')),
        Object.entries(b.puestos).map(([n, k]) => `J${n}: ${name(k)}`).join(' | ')]));
    }
    downloadFile(`resultados-${(t.nombre || 'torneo').replace(/\W+/g, '_')}.csv`, rows.join('\n'));
  }

  onLeave(D.watch(`torneos/${tid}`, (v) => { t = v; render(); }));
  onLeave(D.watch(`paneles/${tid}`, (v) => { paneles = v || {}; render(); }));
  onLeave(D.watch('usuarios', (v) => { users = v || {}; render(); }));
  onLeave(D.watchEq('combates', 'torneo', tid, (v) => { bouts = v; render(); }));

  const onClick = async (e) => {
    const el = e.target;
    if (el.id === 'tpl') { e.preventDefault(); downloadFile('plantilla-programa-sanda.csv', [csvRow(TEMPLATE_HEADERS),
      csvRow([1, 1, 'Infantil', '-40 kg', 'Final', 'Eliminación', 3, 'Panel A', '', 'Nombre Apellido', 'Club', 39.5, 'Nombre Apellido', 'Club', 39]),
      csvRow([2, 2, 'Adulto oficial', '-65 kg', 'Semifinal', 'Eliminación', 5, 'Panel B', '', 'Nombre Apellido', 'Club', 64.2, 'Nombre Apellido', 'Club', 63.8])].join('\n')); }
    if (el.id === 'addp') { const n = document.getElementById('pname').value.trim(); if (n) await D.set(`paneles/${tid}/${D.newKey(`paneles/${tid}`)}`, { nombre: n, miembros: [] }); }
    if (el.dataset.delpanel && confirm('¿Eliminar este panel?')) await D.remove(`paneles/${tid}/${el.dataset.delpanel}`);
    if (el.dataset.delb && confirm('¿Eliminar este combate del programa?')) await D.remove(`combates/${el.dataset.delb}`);
    if (el.id === 'doimport') await doImport();
    if (el.id === 'csv') exportCsv();
    if (el.id === 'fetchcsv') {
      const url = document.getElementById('csvurl').value.trim(); if (!url) return;
      try { const txt = await (await fetch(url)).text(); preview = parseProgram(txt, { plataformas: t.plataformas }); renderPreview(); }
      catch { alert('No se pudo leer el enlace. En Google Sheets usa Archivo → Compartir → Publicar en la Web → formato CSV, o copia y pega la tabla.'); }
    }
  };
  const onChange = async (e) => {
    const el = e.target;
    if (el.dataset.pm) {
      const p = paneles[el.dataset.pm]; let m = D.toArr(p.miembros);
      m = el.checked ? [...m, el.dataset.k] : m.filter((x) => x !== el.dataset.k);
      if (m.length > 5) { el.checked = false; return alert('Un panel tiene como máximo 5 jueces.'); }
      await D.set(`paneles/${tid}/${el.dataset.pm}/miembros`, m);
    }
  };
  const onInput = (e) => { if (e.target.id === 'csvurl') csvUrl = e.target.value; if (e.target.id === 'paste') { const v = pasteText = e.target.value; preview = v.trim() ? parseProgram(v, { plataformas: t.plataformas }) : null; renderPreview(); } };
  const onSubmit = async (e) => {
    if (e.target.id !== 'tf') return; e.preventDefault();
    const f = e.target;
    await D.update({ [`torneos/${tid}/nombre`]: f.nombre.value.trim(), [`torneos/${tid}/fecha`]: f.fecha.value, [`torneos/${tid}/plataformas`]: Number(f.plataformas.value) });
  };
  $app.addEventListener('click', onClick); $app.addEventListener('change', onChange); $app.addEventListener('input', onInput); $app.addEventListener('submit', onSubmit);
  onLeave(() => { $app.removeEventListener('click', onClick); $app.removeEventListener('change', onChange); $app.removeEventListener('input', onInput); $app.removeEventListener('submit', onSubmit); });
}
