// Conexión con Firebase (Auth + Realtime Database) y operaciones de usuarios.
// Con ?emu=1 en la URL se usan los emuladores locales de Firebase (solo para pruebas).
import { initializeApp, deleteApp } from '../vendor/firebase/firebase-app.js';
import * as fa from '../vendor/firebase/firebase-auth.js';
import * as rt from '../vendor/firebase/firebase-database.js';
import { firebaseConfig, LOGIN_DOMAIN } from './firebase-config.js';

export const EMU = new URLSearchParams(location.search).get('emu') === '1';
const config = EMU
  ? { ...firebaseConfig, apiKey: 'demo-key', projectId: 'demo-sanda', databaseURL: 'http://127.0.0.1:9000/?ns=demo-sanda-default-rtdb' }
  : firebaseConfig;

const app = initializeApp(config);
const auth = fa.getAuth(app);
const db = rt.getDatabase(app);
if (EMU) {
  fa.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  rt.connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

// ------------------------------------------------------------ utilidades BD
let offset = 0;
rt.onValue(rt.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
export const now = () => Date.now() + offset;
export const inc = rt.increment;
export const serverTime = rt.serverTimestamp;

export function watch(path, cb) { return rt.onValue(rt.ref(db, path), (s) => cb(s.val()), (e) => console.warn('watch', path, e.message)); }
export async function get(path) { return (await rt.get(rt.ref(db, path))).val(); }
export const update = (updates) => rt.update(rt.ref(db), updates);
export const set = (path, v) => rt.set(rt.ref(db, path), v);
export const remove = (path) => rt.remove(rt.ref(db, path));
export const newKey = (path) => rt.push(rt.ref(db, path)).key;
export function watchEq(path, child, value, cb) {
  return rt.onValue(rt.query(rt.ref(db, path), rt.orderByChild(child), rt.equalTo(value)), (s) => cb(s.val() || {}),
    (e) => console.warn('watchEq', path, e.message));
}
export async function queryEq(path, child, value) {
  const s = await rt.get(rt.query(rt.ref(db, path), rt.orderByChild(child), rt.equalTo(value)));
  return s.val() || {};
}

// Justo después de iniciar sesión, la base de datos puede tardar un instante en recibir la
// credencial nueva: reintentamos las operaciones rechazadas por permisos.
export async function retry(fn, tries = 8, ms = 350) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1 || !/permission/i.test(e.message || e.code || '')) throw e;
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}

// Realtime Database guarda objetos {1:..,2:..} como arreglos con huecos: los normalizamos.
export const toObj = (v) => {
  if (!v || typeof v !== 'object') return {};
  if (!Array.isArray(v)) return v;
  const o = {}; v.forEach((x, i) => { if (x != null) o[i] = x; }); return o;
};
export const toArr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : Object.values(v || {}));
export const normBout = (b) => b && { ...b, events: toArr(b.events), rounds: toObj(b.rounds), puestos: toObj(b.puestos) };

// ---------------------------------------------------------------- usuarios
// Usuario visible "pedro.gonzalez" ↔ clave interna "pedro_gonzalez" (las claves no admiten puntos).
export function cleanUsername(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
}
export const keyOf = (username) => cleanUsername(username).replace(/\./g, '_');
export const userOf = (key) => String(key || '').replace(/_/g, '.');
export const validPin = (p) => /^\d{6}$/.test(String(p || ''));

let profile = null;
const listeners = new Set();
let unProfile = null, presenceOff = null;
export const currentProfile = () => profile;
export function onProfile(cb) { listeners.add(cb); cb(profile); return () => listeners.delete(cb); }
const emit = () => listeners.forEach((f) => f(profile));
export let authReady = false;

fa.onAuthStateChanged(auth, async (u) => {
  unProfile?.(); unProfile = null; presenceOff?.(); presenceOff = null;
  if (!u) { profile = null; authReady = true; emit(); return; }
  const key = await retry(() => get(`uids/${u.uid}`)).catch(() => null);
  if (!key) { profile = { key: null, uid: u.uid, invalid: true }; authReady = true; emit(); return; }
  unProfile = watch(`usuarios/${key}`, (p) => {
    profile = p ? { ...p, key, username: userOf(key), uid: u.uid, roles: p.roles || {} } : { key, invalid: true };
    if (p && p.uid !== u.uid) profile.invalid = true; // PIN restablecido: esta sesión ya no vale
    authReady = true; emit();
  });
  // Presencia: la mesa ve qué jueces están conectados.
  presenceOff = rt.onValue(rt.ref(db, '.info/connected'), (s) => {
    if (!s.val()) return;
    const r = rt.ref(db, `presencia/${key}`);
    rt.onDisconnect(r).remove().then(() => rt.set(r, { online: true, at: rt.serverTimestamp() })).catch(() => {});
  });
});

const emailFor = (key, suffix = '') => `${key}${suffix}@${LOGIN_DOMAIN}`;

export async function login(username, pin) {
  const key = keyOf(username);
  const email = await get(`login/${key}`);
  if (!email) throw new Error('Usuario no existe');
  try { await fa.signInWithEmailAndPassword(auth, email, String(pin)); } catch (e) {
    if (/too-many-requests/.test(e.code)) throw new Error('Demasiados intentos. Espera unos minutos.');
    throw new Error('PIN incorrecto');
  }
}
export async function logout() {
  if (profile?.key) await remove(`presencia/${profile.key}`).catch(() => {});
  await fa.signOut(auth);
}
export async function changeOwnPin(oldPin, newPin) {
  const u = auth.currentUser;
  await fa.reauthenticateWithCredential(u, fa.EmailAuthProvider.credential(u.email, String(oldPin)));
  await fa.updatePassword(u, String(newPin));
}

export async function isInitialized() { return !!(await get('config/inicializado')); }

// Crea la cuenta en Firebase Auth sin cerrar la sesión del administrador (app secundaria).
async function createAuthAccount(email, pin) {
  const sec = initializeApp(config, `sec-${Date.now()}`);
  const sa = fa.getAuth(sec);
  if (EMU) fa.connectAuthEmulator(sa, 'http://127.0.0.1:9099', { disableWarnings: true });
  try {
    const cred = await fa.createUserWithEmailAndPassword(sa, email, String(pin));
    return cred.user.uid;
  } finally { await fa.signOut(sa).catch(() => {}); await deleteApp(sec).catch(() => {}); }
}

export async function bootstrapAdmin(nombre, username, pin) {
  const key = keyOf(username), email = emailFor(key);
  const cred = await fa.createUserWithEmailAndPassword(auth, email, String(pin));
  const uid = cred.user.uid;
  await retry(() => update({
    [`usuarios/${key}`]: { nombre, uid, roles: { admin: true, mesa: true, juez: true }, activo: true },
    [`uids/${uid}`]: key, [`login/${key}`]: email, 'config/inicializado': true,
  }));
  location.reload();
}

export async function createUser({ nombre, username, pin, roles }) {
  const key = keyOf(username);
  if (!key) throw new Error('Usuario inválido');
  if (await get(`login/${key}`)) throw new Error('Ese usuario ya existe');
  const email = emailFor(key);
  const uid = await createAuthAccount(email, pin);
  await update({ [`usuarios/${key}`]: { nombre, uid, roles, activo: true }, [`uids/${uid}`]: key, [`login/${key}`]: email });
}

// Firebase no deja cambiar la clave de otra cuenta desde el navegador: se crea una cuenta nueva
// para el mismo usuario y la anterior queda sin acceso.
export async function resetPin(key, pin) {
  const old = await get(`usuarios/${key}`);
  const email = emailFor(key, `-${Date.now().toString(36)}`);
  const uid = await createAuthAccount(email, pin);
  await update({ [`usuarios/${key}/uid`]: uid, [`uids/${uid}`]: key, [`uids/${old.uid}`]: null, [`login/${key}`]: email });
}
