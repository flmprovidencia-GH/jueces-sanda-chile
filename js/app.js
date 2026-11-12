import * as D from './data.js';
import { $app, esc, href, topbar, resetView, onLeave } from './ui.js';
import { torneoView } from './torneo.js';
import { plataformaView } from './plataforma.js';
import { judgeView } from './juez.js';
import { screenView, actaView } from './pantalla.js';

let lastKey;
D.onProfile((p) => {
  const k = `${D.authReady}|` + (p ? `${p.key}|${p.activo}|${p.invalid}|${JSON.stringify(p.roles || {})}` : 'anon');
  if (k !== lastKey) { lastKey = k; route(); }
});
addEventListener('hashchange', route);

function route() {
  resetView();
  const [, view, a, b] = location.hash.replace(/^#/, '').split('/');
  if (view === 'pantalla' && a) return screenView(a, Number(b || 1)); // pública, sin usuario
  if (!D.authReady) { $app.innerHTML = '<p class="muted center pad">Cargando…</p>'; return; }
  const p = D.currentProfile();
  if (!p) return loginView();
  if (p.invalid) return msg('Esta sesión ya no es válida (quizás te restablecieron el PIN). Vuelve a ingresar.', true);
  if (!p.activo) return msg('Tu usuario está desactivado. Habla con el administrador.', true);
  const r = p.roles || {};
  const mesa = r.mesa || r.admin;
  if (view === 'juez' && r.juez) return judgeView();
  if (view === 'pin') return pinView();
  if (view === 'usuarios' && r.admin) return usersView();
  if (view === 'torneo' && a && r.admin) return torneoView(a);
  if (view === 'plataforma' && a && mesa) return plataformaView(a, Number(b || 1));
  if (view === 'acta' && a && mesa) return actaView(a);
  if (r.juez && !mesa && !r.admin) { location.hash = '#/juez'; return; }
  return homeView();
}

function msg(text, withLogout) {
  $app.innerHTML = `<div class="wrap"><div class="card"><p>${esc(text)}</p>${withLogout ? '<button data-logout>Salir</button>' : ''}</div></div>`;
}

// ============================================================ INGRESO
async function loginView() {
  $app.innerHTML = '<p class="muted center pad">Cargando…</p>';
  const init = await D.isInitialized().catch(() => true);
  if (!init) return setupView();
  $app.innerHTML = `
  <div class="wrap narrow">
    <h1 class="center" style="margin-top:8vh">🥋 Jueces Sanda Chile</h1>
    <form class="card" id="f" autocomplete="on">
      <label>Usuario</label><input name="u" placeholder="nombre.apellido" autocapitalize="none" autocomplete="username" required>
      <label>PIN (6 dígitos)</label><input name="pin" type="password" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="current-password" required>
      <p class="error" id="err"></p>
      <button class="primary wide" type="submit">Ingresar</button>
    </form>
  </div>`;
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button'); btn.disabled = true;
    document.getElementById('err').textContent = '';
    try { await D.login(f.u.value, f.pin.value); } catch (err) { document.getElementById('err').textContent = err.message; btn.disabled = false; }
  };
}

function setupView() {
  $app.innerHTML = `
  <div class="wrap narrow">
    <h1 style="margin-top:6vh">Configuración inicial</h1>
    <p class="muted">Aún no hay usuarios. Crea la cuenta del <b>administrador</b> (por ejemplo, el jefe de jueces).
      Después, desde "Usuarios", podrá crear las cuentas de los jueces.</p>
    <form class="card" id="f">
      <label>Nombre completo</label><input name="nombre" required>
      <label>Usuario</label><input name="u" placeholder="nombre.apellido" autocapitalize="none" required>
      <label>PIN (6 dígitos)</label><input name="pin" type="password" inputmode="numeric" pattern="\\d{6}" maxlength="6" required>
      <p class="error" id="err"></p>
      <button class="primary wide" type="submit">Crear administrador</button>
    </form>
  </div>`;
  const f = document.getElementById('f');
  f.nombre.oninput = () => { if (!f.u.dataset.touched) f.u.value = suggestUser(f.nombre.value); };
  f.u.oninput = () => { f.u.dataset.touched = 1; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await D.bootstrapAdmin(f.nombre.value.trim(), f.u.value, f.pin.value); } catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

const suggestUser = (nombre) => { const w = D.cleanUsername(nombre).split('.'); return w.length > 1 ? `${w[0]}.${w[1]}` : w[0] || ''; };

function pinView() {
  $app.innerHTML = `<div class="wrap narrow">${topbar('Cambiar mi PIN')}
    <form class="card" id="f">
      <label>PIN actual</label><input name="a" type="password" inputmode="numeric" maxlength="6" required>
      <label>PIN nuevo (6 dígitos)</label><input name="b" type="password" inputmode="numeric" pattern="\\d{6}" maxlength="6" required>
      <p class="error" id="err"></p><button class="primary" type="submit">Guardar</button>
    </form></div>`;
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await D.changeOwnPin(f.a.value, f.b.value); alert('PIN actualizado'); location.hash = '#/'; } catch { document.getElementById('err').textContent = 'PIN actual incorrecto'; }
  };
}

// ============================================================ INICIO
function homeView() {
  const p = D.currentProfile(), r = p.roles || {};
  $app.innerHTML = `<div class="wrap">${topbar('Jueces Sanda Chile', D.EMU ? '<span class="tag">EMULADOR</span>' : '')}
    <div class="row" style="margin:12px 0">
      ${r.juez ? `<a href="${href('/juez')}"><button class="primary">📱 Modo juez de línea</button></a>` : ''}
      ${r.admin ? `<a href="${href('/usuarios')}"><button>👥 Usuarios</button></a>` : ''}
    </div>
    <div class="card"><h2>Torneos</h2><div id="list" class="muted">Cargando…</div></div>
    ${r.admin ? `<form class="card" id="nt"><h2>Nuevo torneo</h2>
      <div class="row">
        <div class="grow"><label>Nombre</label><input name="nombre" required placeholder="Ej. Campeonato Nacional 2026"></div>
        <div><label>Fecha</label><input name="fecha" type="date"></div>
        <div style="width:150px"><label>Plataformas</label><select name="plataformas"><option>1</option><option>2</option><option selected>3</option></select></div>
      </div><div class="row" style="margin-top:10px"><button class="primary" type="submit">Crear torneo</button></div></form>` : ''}
  </div>`;
  onLeave(D.watch('torneos', (t) => {
    const list = Object.entries(t || {}).sort((a, b) => (b[1].fecha || '').localeCompare(a[1].fecha || '') || b[1].creado - a[1].creado);
    document.getElementById('list').innerHTML = list.length ? list.map(([id, x]) => `
      <div class="torneo-row">
        <div class="grow"><b>${esc(x.nombre)}</b> <span class="muted">${esc(x.fecha || '')}</span></div>
        <div class="row">
          ${Array.from({ length: x.plataformas || 1 }, (_, i) => i + 1).map((n) =>
            `<a href="${href(`/plataforma/${id}/${n}`)}"><button class="small">Mesa P${n}</button></a>`).join('')}
          ${r.admin ? `<a href="${href(`/torneo/${id}`)}"><button class="small primary">Administrar</button></a>` : ''}
        </div>
      </div>`).join('') : 'Aún no hay torneos.';
  }));
  const nt = document.getElementById('nt');
  if (nt) nt.onsubmit = async (e) => {
    e.preventDefault();
    const id = D.newKey('torneos');
    await D.set(`torneos/${id}`, { nombre: nt.nombre.value.trim(), fecha: nt.fecha.value || '', plataformas: Number(nt.plataformas.value), creado: D.now() });
    location.hash = `#/torneo/${id}`;
  };
}

// ============================================================ USUARIOS
function usersView() {
  let users = {}, pres = {};
  const ROLES = [['juez', 'Juez de línea'], ['mesa', 'Mesa central'], ['admin', 'Administrador']];
  $app.innerHTML = `<div class="wrap">${topbar('Usuarios')}
    <form class="card" id="f"><h2>Nuevo usuario</h2>
      <div class="row">
        <div class="grow"><label>Nombre completo</label><input name="nombre" required></div>
        <div class="grow"><label>Usuario</label><input name="u" placeholder="nombre.apellido" autocapitalize="none" required></div>
        <div style="width:170px"><label>PIN inicial</label><div class="row" style="flex-wrap:nowrap;gap:4px">
          <input name="pin" inputmode="numeric" pattern="\\d{6}" maxlength="6" required><button type="button" class="small" id="gen" title="Generar">🎲</button></div></div>
      </div>
      <div class="row" style="margin-top:8px">${ROLES.map(([k, l]) => `<label class="check"><input type="checkbox" name="r_${k}" ${k === 'juez' ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <p class="error" id="err"></p>
      <button class="primary" type="submit">Crear usuario</button>
      <p class="muted" style="font-size:.85rem">Anota el PIN y entrégaselo a la persona. Luego puede cambiarlo desde "Cambiar PIN".</p>
    </form>
    <div class="card"><h2>Usuarios registrados</h2><div id="list"></div></div></div>`;
  const f = document.getElementById('f');
  const gen = () => { f.pin.value = String(Math.floor(Math.random() * 1e6)).padStart(6, '0'); };
  document.getElementById('gen').onclick = gen; gen();
  f.nombre.oninput = () => { if (!f.u.dataset.touched) f.u.value = suggestUser(f.nombre.value); };
  f.u.oninput = () => { f.u.dataset.touched = 1; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('err'); err.textContent = '';
    if (!D.validPin(f.pin.value)) { err.textContent = 'El PIN debe tener 6 dígitos'; return; }
    const roles = Object.fromEntries(ROLES.map(([k]) => [k, f[`r_${k}`].checked]));
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await D.createUser({ nombre: f.nombre.value.trim(), username: f.u.value, pin: f.pin.value, roles });
      alert(`Usuario creado:\n\nUsuario: ${D.cleanUsername(f.u.value)}\nPIN: ${f.pin.value}`);
      f.reset(); delete f.u.dataset.touched; f.r_juez.checked = true; gen();
    } catch (x) { err.textContent = /email-already/.test(x.code) ? 'Ese usuario ya existe' : x.message; }
    btn.disabled = false;
  };
  const render = () => {
    const me = D.currentProfile().key;
    const rows = Object.entries(users).sort((a, b) => (a[1].nombre || '').localeCompare(b[1].nombre || ''));
    document.getElementById('list').innerHTML = `<div class="table-scroll"><table>
      <tr><th style="text-align:left">Nombre</th><th>Usuario</th>${ROLES.map(([, l]) => `<th>${l}</th>`).join('')}<th>Activo</th><th></th></tr>
      ${rows.map(([k, u]) => `<tr class="${u.activo ? '' : 'off'}">
        <td style="text-align:left"><span class="dot ${pres[k] ? 'on' : ''}"></span>${esc(u.nombre)}</td><td><code>${esc(D.userOf(k))}</code></td>
        ${ROLES.map(([r]) => `<td><input type="checkbox" data-role="${r}" data-k="${k}" ${u.roles?.[r] ? 'checked' : ''} ${k === me && r === 'admin' ? 'disabled' : ''}></td>`).join('')}
        <td><input type="checkbox" data-act data-k="${k}" ${u.activo ? 'checked' : ''} ${k === me ? 'disabled' : ''}></td>
        <td><button class="small" data-reset="${k}">Restablecer PIN</button></td></tr>`).join('')}
    </table></div>`;
  };
  onLeave(D.watch('usuarios', (u) => { users = u || {}; render(); }));
  onLeave(D.watch('presencia', (p) => { pres = p || {}; render(); }));
  const onChange = (e) => {
    const t = e.target;
    if (t.dataset.role) D.set(`usuarios/${t.dataset.k}/roles/${t.dataset.role}`, t.checked);
    if (t.hasAttribute('data-act')) D.set(`usuarios/${t.dataset.k}/activo`, t.checked);
  };
  const onClick = async (e) => {
    const k = e.target.closest('[data-reset]')?.dataset.reset; if (!k) return;
    const pin = prompt(`Nuevo PIN de 6 dígitos para ${D.userOf(k)}:`, String(Math.floor(Math.random() * 1e6)).padStart(6, '0'));
    if (!pin) return;
    if (!D.validPin(pin)) return alert('El PIN debe tener 6 dígitos');
    try { await D.resetPin(k, pin); alert(`PIN restablecido.\nUsuario: ${D.userOf(k)}\nPIN: ${pin}`); } catch (x) { alert(x.message); }
  };
  $app.addEventListener('change', onChange); $app.addEventListener('click', onClick);
  onLeave(() => { $app.removeEventListener('change', onChange); $app.removeEventListener('click', onClick); });
}
