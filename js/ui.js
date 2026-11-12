// Utilidades de interfaz compartidas.
import { now, currentProfile, logout } from './data.js';

export const $app = document.getElementById('app');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SIDE_LABEL = { rojo: 'Rojo', azul: 'Azul', empate: 'Empate' };
export const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const remaining = (t) => (!t ? 0 : t.running ? t.endsAt - now() : (t.remaining || 0));
export const fighter = (b, s) => `<span class="txt-${s}">${esc(b?.[s]?.name || SIDE_LABEL[s])}</span>`;
export const winnerTag = (w) => (w === 'empate' ? '<span class="tag">Empate</span>' : w ? `<span class="tag ${w}">${SIDE_LABEL[w]}</span>` : '—');
export const href = (path) => `${location.pathname}${location.search}#${path}`;
export const fullLink = (path) => `${location.origin}${href(path)}`;
export const uid = () => Math.random().toString(36).slice(2, 10);
export function genCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

// Limpieza de suscripciones al cambiar de pantalla.
let cleanup = [];
export const onLeave = (f) => { if (f) cleanup.push(f); };
export function resetView() { cleanup.forEach((f) => { try { f(); } catch {} }); cleanup = []; }

// Barra superior con usuario y salida.
export function topbar(title, extra = '') {
  const p = currentProfile();
  return `<div class="row topbar">
    <a href="${href('/')}">🥋 Inicio</a>
    <h1 class="grow" style="margin:0">${title}</h1>
    ${extra}
    ${p?.nombre ? `<span class="muted">${esc(p.nombre)}</span>
      <a class="tag" href="${href('/pin')}">Cambiar PIN</a>
      <button class="small" data-logout>Salir</button>` : ''}
  </div>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-logout]')) logout().then(() => { location.hash = '#/'; });
});

export function downloadFile(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
export const csvRow = (cells) => cells.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',');
