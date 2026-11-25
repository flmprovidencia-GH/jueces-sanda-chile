// Administración de un torneo: datos, paneles de jueces, programa (desde Google Sheets) y resultados.
import * as D from './data.js';
import { CATEGORIES, boutStatus, warnings, admonitions, counts } from './logic.js';
import { parseProgram, TEMPLATE_HEADERS } from './program.js';
import { $app, esc, href, topbar, onLeave, fighter, genCode, downloadFile, csvRow, SIDE_LABEL } from './ui.js';

const PHASE_TXT = { programado: 'Programado', listo: 'En plataforma', combate: 'En curso', revision: 'En curso', descanso: 'En curso', cierre: 'Por cerrar', final: 'Finalizado' };

export function torneoView(tid) {
  let t = null, paneles = {}, bouts = {}, users = {}, preview = null, pasteText = '', csvUrl = '', fileName = '';
  let editing = null, draft = null; // editor de combate: código o 'new'
  // El selector de archivo vive fuera del contenido que se redibuja, para no perder la selección.
  const fileInput = Object.assign(document.createElement('input'), { type: 'file', id: 'file', accept: '.xlsx,.xls,.csv,.tsv,.txt' });
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => { if (fileInput.files[0]) { await readFile(fileInput.files[0]); fileInput.value = ''; } });
  document.body.appendChild(fileInput);
  onLeave(() => fileInput.remove());
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
        <button class="primary" style="align-self:flex-end">Guardar</button>
        <button type="button" class="danger" style="align-self:flex-end" id="deltorneo">🗑 Eliminar torneo</button></div>
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
        ${editing ? editorHtml() : ''}
        <details ${list.length && !preview ? '' : 'open'}><summary><b>Importar programa (Excel, Google Sheets o CSV)</b></summary>
          <ol class="muted" style="font-size:.9rem">
            <li>Descarga la <a href="#" id="tpl">plantilla</a> y complétala en Excel o Google Sheets, o usa tu planilla con los mismos títulos.</li>
            <li><b>Sube el archivo</b> (.xlsx o .csv) o copia la tabla completa, incluida la fila de títulos, y pégala abajo.</li>
            <li>Revisa la vista previa y elige <b>Agregar</b> o <b>Reemplazar</b>. Después puedes editar cada combate con ✏️.</li>
          </ol>
          <div class="row" style="margin-bottom:8px"><label class="filebtn" id="filebtn" for="file">📂 Subir archivo</label>
            <span class="muted" id="fname">${esc(fileName)}</span></div>
          <p class="muted" style="font-size:.85rem">Columnas: ${TEMPLATE_HEADERS.join(' · ')}. Obligatorias: Plataforma, Rojo y Azul.
            Categoría: Infantil, Juvenil, Adulto light, Adulto oficial o Super lucha.</p>
          <textarea id="paste" rows="6" placeholder="Pega aquí la tabla copiada desde Google Sheets…"></textarea>
          <div class="row" style="margin-top:8px"><span class="muted">o enlace CSV publicado:</span>
            <input id="csvurl" class="grow" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"><button id="fetchcsv">Cargar</button></div>
          <div id="prev"></div>
        </details>
        <div class="row" style="margin:12px 0"><b>${list.length}</b> combates · ${done} finalizados
          <span class="grow"></span><button class="small primary" id="newbout">＋ Agregar combate</button>
          <button class="small" id="csv">⬇ Descargar resultados (Excel)</button></div>
        ${plats.map((n) => {
          const pl = list.filter((b) => b.plataforma === n);
          return `<h3>Plataforma ${n} <span class="muted">(${pl.length})</span></h3>${pl.length ? `<div class="table-scroll"><table class="prog">
            <tr><th>#</th><th style="text-align:left">Combate</th><th>Categoría</th><th>Panel</th><th>Estado</th><th></th></tr>
            ${pl.map((b) => `<tr><td>${b.orden}</td>
              <td style="text-align:left">${fighter(b, 'rojo')} vs ${fighter(b, 'azul')}<br><span class="muted">${esc(b.label || '')}</span></td>
              <td>${esc(b.cat?.name)} · ${b.judges}J</td><td>${esc(b.panel || '')}</td>
              <td>${b.phase === 'final' ? (b.result?.winner === 'empate' ? 'Empate' : `Gana ${fighter(b, b.result?.winner)}`) : PHASE_TXT[b.phase] || b.phase}</td>
              <td class="actions">${b.phase === 'final' ? `<a href="${href(`/acta/${b.code}`)}">Acta</a>` : ''}
                <button class="small" data-editb="${b.code}" title="Editar combate">✏️</button>
                ${b.phase !== 'programado' ? `<button class="small" data-resetb="${b.code}" title="Volver a Programado y borrar puntajes">↺ Reiniciar</button>` : ''}
                <button class="small danger" data-delb="${b.code}" title="Eliminar combate">🗑</button></td></tr>`).join('')}
            </table></div>` : '<p class="muted">Sin combates.</p>'}`;
        }).join('')}
      </div>`;
    if (!fileInput.isConnected) document.body.appendChild(fileInput);
    document.getElementById('paste').value = pasteText;
    document.getElementById('csvurl').value = csvUrl;
    renderPreview();
  }

  function renderPreview() {
    const el = document.getElementById('prev'); if (!el) return;
    if (!preview) { el.innerHTML = ''; return; }
    const { bouts: bs, errors, warnings = [] } = preview;
    el.innerHTML = `<div class="card" style="margin-top:10px">
      ${errors.length ? `<div class="banner"><b>Revisa estos problemas (corrígelos en la planilla y vuelve a cargar):</b><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${warnings.length ? `<div class="banner"><b>Atención:</b><ul>${warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      <p><b>${bs.length}</b> combates leídos: ${[1, 2, 3].map((n) => `P${n}: ${bs.filter((b) => b.plataforma === n).length}`).join(' · ')}</p>
      <div class="table-scroll" style="max-height:360px;overflow:auto"><table><tr><th>#</th><th>P</th><th>Categoría</th><th style="text-align:left">Rojo</th><th style="text-align:left">Azul</th><th>Jueces</th><th>Panel</th></tr>
      ${bs.map((b) => `<tr><td>${b.orden}</td><td>${b.plataforma}</td><td>${esc(CATEGORIES[b.catKey].name)} ${esc(b.division)}</td>
        <td style="text-align:left">${esc(b.rojo.name)}</td><td style="text-align:left">${esc(b.azul.name)}</td><td>${b.judges}</td><td>${esc(b.panel)}</td></tr>`).join('')}
      </table></div>
      <div class="row" style="margin-top:10px">
        <button class="primary" data-import="add" ${errors.length || !bs.length ? 'disabled' : ''}>＋ Agregar ${bs.length} combates</button>
        <button data-import="replace" ${errors.length || !bs.length ? 'disabled' : ''}>Reemplazar los programados</button>
        <span class="muted" style="font-size:.85rem">"Reemplazar" borra los combates aún no iniciados y carga estos. Los iniciados o terminados no se tocan.</span></div></div>`;
  }

  // ---------------------------------------------------------- EDITOR DE COMBATE
  function startEdit(code) {
    if (code === 'new') {
      const list = Object.values(bouts);
      const plat = 1;
      const orden = Math.max(0, ...list.filter((b) => b.plataforma === plat).map((b) => b.orden || 0)) + 1;
      draft = { plataforma: plat, orden, catKey: 'oficial', division: '', fase: '', system: 'eliminacion', judges: 3, panel: '',
        koAllowed: CATEGORIES.oficial.koAllowed, roundSec: CATEGORIES.oficial.roundSec,
        rojo_name: '', rojo_club: '', rojo_weight: '', azul_name: '', azul_club: '', azul_weight: '', arbitro: '' };
    } else {
      const b = D.normBout(bouts[code]);
      const [division = '', fase = ''] = String(b.label || '').split(' · ');
      draft = { plataforma: b.plataforma, orden: b.orden, catKey: b.cat?.key || 'oficial', division, fase, system: b.system, judges: b.judges,
        panel: b.panel || '', koAllowed: !!b.cat?.koAllowed, roundSec: b.cat?.roundSec || 120,
        rojo_name: b.rojo?.name || '', rojo_club: b.rojo?.club || '', rojo_weight: b.rojo?.weight ?? '',
        azul_name: b.azul?.name || '', azul_club: b.azul?.club || '', azul_weight: b.azul?.weight ?? '', arbitro: b.arbitro || '' };
    }
    editing = code; render();
    document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function editorHtml() {
    const d = draft, isNew = editing === 'new';
    const b = isNew ? null : D.normBout(bouts[editing]);
    const locked = !isNew && b && b.phase !== 'programado'; // ya empezó: solo datos de los competidores
    const dis = locked ? 'disabled' : '';
    const inp = (f, attrs = '') => `<input data-ef="${f}" value="${esc(d[f])}" ${attrs}>`;
    const sel = (f, opts, attrs = '') => `<select data-ef="${f}" ${attrs}>${opts.map(([v, l]) => `<option value="${v}" ${String(d[f]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<div class="card editor" id="editor"><h3>${isNew ? 'Agregar combate' : `Editar combate #${b.orden}`}</h3>
      ${locked ? '<div class="banner">Este combate ya comenzó: solo se pueden corregir nombres, clubes, pesos, división y fase. Para cambiar el resto, usa ↺ Reiniciar.</div>' : ''}
      <div class="row">
        <div style="width:110px"><label>Plataforma</label>${sel('plataforma', Array.from({ length: t.plataformas || 1 }, (_, i) => [i + 1, i + 1]), dis)}</div>
        <div style="width:90px"><label>Orden</label>${inp('orden', `type="number" min="1" ${dis}`)}</div>
        <div class="grow"><label>Categoría</label>${sel('catKey', Object.entries(CATEGORIES).map(([k, c]) => [k, c.name]), dis)}</div>
        <div class="grow"><label>División</label>${inp('division', 'placeholder="-65 kg"')}</div>
        <div class="grow"><label>Fase</label>${inp('fase', 'placeholder="Semifinal"')}</div>
      </div>
      <div class="row">
        <div class="grow"><label>Sistema</label>${sel('system', [['eliminacion', 'Eliminación'], ['todos', 'Todos contra todos']], dis)}</div>
        <div style="width:110px"><label>Jueces</label>${sel('judges', [[3, '3'], [5, '5']], dis)}</div>
        <div class="grow"><label>Panel</label>${sel('panel', [['', '— ninguno —'], ...Object.values(paneles).map((x) => [x.nombre, x.nombre])], dis)}</div>
        <div style="width:150px"><label>Duración round (seg)</label>${inp('roundSec', `type="number" min="30" step="10" ${dis}`)}</div>
        <label class="check" style="margin-top:22px"><input type="checkbox" data-ef="koAllowed" ${d.koAllowed ? 'checked' : ''} ${dis}> KO permitido</label>
      </div>
      <div class="row"><div class="grow"><label>Juez de plataforma (registro)</label>${sel('arbitro', [['', '— sin registrar —'],
        ...Object.entries(users).filter(([, u]) => u.activo).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre)).map(([k, u]) => [k, u.nombre])])}</div></div>
      <div class="grid2" style="margin-top:8px">${['rojo', 'azul'].map((s) => `<div class="card side-${s}" style="margin:0">
        <h3 class="txt-${s}">Esquina ${s === 'rojo' ? 'Roja' : 'Azul'}</h3>
        <label>Nombre</label>${inp(`${s}_name`)}
        <div class="row"><div class="grow"><label>Club</label>${inp(`${s}_club`)}</div>
          <div style="width:110px"><label>Peso (kg)</label>${inp(`${s}_weight`, 'type="number" step="0.1" min="0"')}</div></div></div>`).join('')}</div>
      <p class="error" id="ederr"></p>
      <div class="row"><button class="primary" id="esave">💾 Guardar</button><button id="ecancel">Cancelar</button></div></div>`;
  }

  async function saveEdit() {
    const d = draft, isNew = editing === 'new';
    const err = (m) => { document.getElementById('ederr').textContent = m; };
    if (!String(d.rojo_name).trim() || !String(d.azul_name).trim()) return err('Faltan los nombres de los competidores.');
    const w = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
    const side = (s) => ({ name: String(d[`${s}_name`]).trim(), club: String(d[`${s}_club`]).trim(), weight: w(d[`${s}_weight`]) });
    const label = [String(d.division).trim(), String(d.fase).trim()].filter(Boolean).join(' · ');
    const b = isNew ? null : D.normBout(bouts[editing]);
    if (!isNew && b.phase !== 'programado') {
      await D.update({ [`combates/${editing}/rojo`]: side('rojo'), [`combates/${editing}/azul`]: side('azul'), [`combates/${editing}/label`]: label, [`combates/${editing}/arbitro`]: d.arbitro || null });
    } else {
      const roundSec = Math.max(30, Number(d.roundSec) || CATEGORIES[d.catKey].roundSec);
      const cat = { key: d.catKey, ...CATEGORIES[d.catKey], koAllowed: !!d.koAllowed, roundSec };
      const data = { torneo: tid, plataforma: Number(d.plataforma), orden: Number(d.orden) || 1, panel: d.panel || '', label, cat,
        system: d.system, judges: Number(d.judges) === 5 ? 5 : 3, rojo: side('rojo'), azul: side('azul'), arbitro: d.arbitro || null,
        round: 1, phase: 'programado', timer: { running: false, remaining: roundSec * 1000 } };
      if (isNew) await D.set(`combates/${genCode()}`, { ...data, createdAt: D.now() });
      else await D.update(Object.fromEntries(Object.entries(data).map(([k, v]) => [`combates/${editing}/${k}`, v])));
    }
    editing = null; draft = null; render();
  }

  async function readFile(file) {
    fileName = file.name;
    try {
      let txt;
      if (/\.xlsx?$/i.test(file.name)) {
        if (!self.XLSX) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'vendor/xlsx/xlsx.full.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
        const wb = self.XLSX.read(await file.arrayBuffer(), { type: 'array' });
        txt = self.XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t', blankrows: false });
      } else {
        const buf = await file.arrayBuffer();
        try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { txt = new TextDecoder('windows-1252').decode(buf); } // CSV de Excel en español
      }
      pasteText = ''; preview = parseProgram(txt, { plataformas: t.plataformas });
    } catch (e) { preview = { bouts: [], warnings: [], errors: [`No se pudo leer el archivo "${file.name}": ${e.message || e}`] }; }
    render();
  }

  async function doImport(mode) {
    const upd = {};
    if (mode === 'replace') for (const [code, b] of Object.entries(bouts)) if (b.phase === 'programado') upd[`combates/${code}`] = null;
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
    preview = null; pasteText = ''; fileName = ''; document.getElementById('paste').value = ''; render();
    alert('Programa importado.');
  }

  const loadXlsx = async () => {
    if (!self.XLSX) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'vendor/xlsx/xlsx.full.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
    return self.XLSX;
  };

  // Resultados en Excel: hoja "Resultados" (un combate por fila) y "Detalle por juez" (puntaje de cada juez por round).
  async function exportResults() {
    const X = await loadXlsx();
    const list = Object.entries(bouts).map(([code, b]) => ({ code, ...D.normBout(b) })).sort((a, b) => a.plataforma - b.plataforma || a.orden - b.orden);
    const name = (k) => (k ? users[k]?.nombre || D.userOf(k) : '');
    const fecha = (ms) => (ms ? new Date(ms).toLocaleString('es-CL') : '');
    const H1 = ['Plataforma', 'Orden', 'Categoría', 'División / Fase', 'Sistema', 'Rojo', 'Club rojo', 'Peso rojo', 'Azul', 'Club azul', 'Peso azul',
      'Estado', 'Ganador', 'Nombre ganador', 'Motivo', 'Rounds rojo', 'Rounds azul', 'R1', 'R2', 'R3', 'Extra',
      'Adv. rojo', 'Amon. rojo', 'Conteos rojo', 'Adv. azul', 'Amon. azul', 'Conteos azul',
      'Juez 1', 'Juez 2', 'Juez 3', 'Juez 4', 'Juez 5', 'Juez de plataforma', 'Mesa central', 'Hora de cierre', 'Código'];
    const r1 = list.map((b) => {
      const st = boutStatus(b), w = b.result?.winner, ev = b.events;
      const extra = Object.keys(b.rounds).map(Number).filter((n) => n > 3).map((n) => SIDE_LABEL[b.rounds[n].winner]).join(', ');
      return [b.plataforma, b.orden, b.cat?.name, b.label || '', b.system === 'todos' ? 'Todos contra todos' : 'Eliminación',
        b.rojo?.name, b.rojo?.club, b.rojo?.weight ?? '', b.azul?.name, b.azul?.club, b.azul?.weight ?? '',
        PHASE_TXT[b.phase] || b.phase, w ? SIDE_LABEL[w] : '', w && w !== 'empate' ? b[w]?.name : '', b.result?.reason || '',
        st.wins.rojo, st.wins.azul, ...[1, 2, 3].map((n) => (b.rounds[n] ? SIDE_LABEL[b.rounds[n].winner] : '')), extra,
        warnings(ev, 'rojo'), admonitions(ev, 'rojo'), counts(ev, 'rojo'), warnings(ev, 'azul'), admonitions(ev, 'azul'), counts(ev, 'azul'),
        ...[1, 2, 3, 4, 5].map((n) => name(b.puestos[n])), name(b.arbitro), name(b.mesa), fecha(b.result?.at), b.code];
    });
    const H2 = ['Plataforma', 'Orden', 'Combate', 'Round', 'Ganador del round', 'Motivo', 'Puesto', 'Juez', 'Puntos rojo', 'Puntos azul', 'Voto'];
    const r2 = [];
    for (const b of list) for (const n of Object.keys(b.rounds).map(Number).sort((x, y) => x - y)) {
      const rd = b.rounds[n];
      for (const v of D.toArr(rd.votes)) r2.push([b.plataforma, b.orden, `${b.rojo?.name} vs ${b.azul?.name}`, n > 3 ? 'Extra' : n,
        SIDE_LABEL[rd.winner], rd.reason || '', `J${v.judge}`, name(v.u), v.rojo, v.azul, SIDE_LABEL[v.vote]]);
    }
    const sheet = (h, rows) => { const ws = X.utils.aoa_to_sheet([h, ...rows]); ws['!cols'] = h.map((x, i) => ({ wch: Math.min(32, Math.max(8, x.length + 2, ...rows.map((r) => String(r[i] ?? '').length + 1))) })); ws['!autofilter'] = { ref: ws['!ref'] }; return ws; };
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, sheet(H1, r1), 'Resultados');
    X.utils.book_append_sheet(wb, sheet(H2, r2), 'Detalle por juez');
    X.writeFile(wb, `resultados-${(t.nombre || 'torneo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '_')}.xlsx`);
  }

  onLeave(D.watch(`torneos/${tid}`, (v) => { t = v; render(); }));
  onLeave(D.watch(`paneles/${tid}`, (v) => { paneles = v || {}; render(); }));
  onLeave(D.watch('usuarios', (v) => { users = v || {}; render(); }));
  onLeave(D.watchEq('combates', 'torneo', tid, (v) => { bouts = v; render(); }));

  const onClick = async (e) => {
    const el = e.target;
    if (el.id === 'tpl') {
      e.preventDefault();
      if (!self.XLSX) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'vendor/xlsx/xlsx.full.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
      const X = self.XLSX;
      const ws = X.utils.aoa_to_sheet([TEMPLATE_HEADERS,
        [1, 1, 'Infantil', '-40 kg', 'Final', 'Eliminación', 3, 'Panel A', '', 'Nombre Apellido', 'Club', 39.5, 'Nombre Apellido', 'Club', 39],
        [2, 2, 'Adulto oficial', '-65 kg', 'Semifinal', 'Eliminación', 5, 'Panel B', '', 'Nombre Apellido', 'Club', 64.2, 'Nombre Apellido', 'Club', 63.8]]);
      ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(9, h.length + 2) }));
      const ayuda = X.utils.aoa_to_sheet([['Columna', 'Valores'], ['Plataforma', '1, 2 o 3'], ['Categoría', 'Infantil · Juvenil · Adulto light · Adulto oficial · Super lucha'],
        ['Sistema', 'Eliminación · Todos contra todos'], ['Jueces', '3 o 5'], ['Panel', 'Nombre del panel (opcional), ej. Panel A'], ['KO', 'Sí / No (opcional; si se deja vacío usa el de la categoría)'],
        ['Obligatorias', 'Plataforma, Rojo y Azul']]);
      ayuda['!cols'] = [{ wch: 14 }, { wch: 70 }];
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Programa'); X.utils.book_append_sheet(wb, ayuda, 'Ayuda');
      X.writeFile(wb, 'plantilla-programa-sanda.xlsx');
    }
    if (el.id === 'addp') { const n = document.getElementById('pname').value.trim(); if (n) await D.set(`paneles/${tid}/${D.newKey(`paneles/${tid}`)}`, { nombre: n, miembros: [] }); }
    if (el.dataset.delpanel && confirm('¿Eliminar este panel?')) await D.remove(`paneles/${tid}/${el.dataset.delpanel}`);
    if (el.dataset.delb) {
      const b = D.normBout(bouts[el.dataset.delb]);
      const warn = b.phase === 'programado' ? '' : b.phase === 'final' ? '\n\nEste combate ya terminó: se borrará también su acta.' : '\n\nEste combate está EN CURSO o sin cerrar.';
      if (confirm(`¿Eliminar el combate #${b.orden} ${b.rojo?.name} vs ${b.azul?.name}?${warn}`)) await D.deleteBout(el.dataset.delb, b);
    }
    if (el.dataset.resetb) {
      const b = D.normBout(bouts[el.dataset.resetb]);
      if (confirm(`¿Reiniciar el combate #${b.orden} ${b.rojo?.name} vs ${b.azul?.name}?\n\nVuelve a "Programado" y se borran puntajes, acciones y resultado.`)) await D.resetBout(el.dataset.resetb, b);
    }
    if (el.id === 'deltorneo') {
      const n = Object.keys(bouts).length;
      const ok = prompt(`Se eliminará el torneo "${t.nombre}" con sus ${n} combates, actas, paneles y asignaciones. No se puede deshacer.\n\nPara confirmar escribe: ELIMINAR`);
      if (ok && ok.trim().toUpperCase() === 'ELIMINAR') { await D.deleteTorneo(tid); location.hash = '#/'; }
    }
    if (el.dataset.import) await doImport(el.dataset.import);
    if (el.id === 'newbout') startEdit('new');
    if (el.dataset.editb) startEdit(el.dataset.editb);
    if (el.id === 'ecancel') { editing = null; draft = null; render(); }
    if (el.id === 'esave') await saveEdit();
    if (el.id === 'csv') await exportResults();
    if (el.id === 'fetchcsv') {
      const url = document.getElementById('csvurl').value.trim(); if (!url) return;
      try { const txt = await (await fetch(url)).text(); preview = parseProgram(txt, { plataformas: t.plataformas }); renderPreview(); }
      catch { alert('No se pudo leer el enlace. En Google Sheets usa Archivo → Compartir → Publicar en la Web → formato CSV, o copia y pega la tabla.'); }
    }
  };
  const onChange = async (e) => {
    const el = e.target;
    if (el.dataset.ef) {
      draft[el.dataset.ef] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.ef === 'catKey') { const c = CATEGORIES[el.value]; draft.koAllowed = c.koAllowed; draft.roundSec = c.roundSec; render(); }
      if (el.dataset.ef === 'plataforma' && editing === 'new') { const n = Number(el.value); draft.orden = Math.max(0, ...Object.values(bouts).filter((b) => b.plataforma === n).map((b) => b.orden || 0)) + 1; render(); }
      return;
    }
    if (el.dataset.pm) {
      const p = paneles[el.dataset.pm]; let m = D.toArr(p.miembros);
      m = el.checked ? [...m, el.dataset.k] : m.filter((x) => x !== el.dataset.k);
      if (m.length > 5) { el.checked = false; return alert('Un panel tiene como máximo 5 jueces.'); }
      await D.set(`paneles/${tid}/${el.dataset.pm}/miembros`, m);
    }
  };
  const onInput = (e) => { if (e.target.dataset.ef && e.target.type !== 'checkbox') draft[e.target.dataset.ef] = e.target.value; if (e.target.id === 'csvurl') csvUrl = e.target.value; if (e.target.id === 'paste') { const v = pasteText = e.target.value; preview = v.trim() ? parseProgram(v, { plataformas: t.plataformas }) : null; renderPreview(); } };
  const onSubmit = async (e) => {
    if (e.target.id !== 'tf') return; e.preventDefault();
    const f = e.target;
    await D.update({ [`torneos/${tid}/nombre`]: f.nombre.value.trim(), [`torneos/${tid}/fecha`]: f.fecha.value, [`torneos/${tid}/plataformas`]: Number(f.plataformas.value) });
  };
  $app.addEventListener('click', onClick); $app.addEventListener('change', onChange); $app.addEventListener('input', onInput); $app.addEventListener('submit', onSubmit);
  onLeave(() => { $app.removeEventListener('click', onClick); $app.removeEventListener('change', onChange); $app.removeEventListener('input', onInput); $app.removeEventListener('submit', onSubmit); });
}
