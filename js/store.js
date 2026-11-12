// Capa de datos. Dos modos con la misma interfaz:
//  - "firebase": Firebase Realtime Database (producción, entre celulares).
//    Se eligió Realtime Database (y no Firestore) porque su plan gratuito no cobra por
//    lectura: alcanza para ~120+ combates diarios con 5 jueces.
//  - "local": localStorage + BroadcastChannel (demo/pruebas en un mismo navegador).
//
// Estructura en Realtime Database:
//   combates/{CODE}         → datos del combate (lo escribe solo la mesa que lo creó)
//   jueces/{CODE}/{N}/taps  → golpes marcados por el juez N, por round
import { firebaseConfig } from './firebase-config.js';

const useFirebase = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.databaseURL);
export const MODE = useFirebase ? 'firebase' : 'local';

// Hora sincronizada con el servidor (para que todos los relojes coincidan).
let offset = 0;
export const now = () => Date.now() + offset;

function genCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

// Realtime Database convierte objetos con claves 1,2,3 en arreglos con huecos: los normalizamos.
const toObj = (v) => {
  if (!v || typeof v !== 'object') return v || {};
  if (!Array.isArray(v)) return v;
  const o = {}; v.forEach((x, i) => { if (x != null) o[i] = x; }); return o;
};
const normBout = (b) => b && { ...b, events: Array.isArray(b.events) ? b.events.filter(Boolean) : Object.values(b.events || {}), rounds: toObj(b.rounds) };
const normJudge = (j) => j && { ...j, taps: toObj(j.taps) };

// ---------------------------------------------------------------- LOCAL
function localStore() {
  const ch = 'BroadcastChannel' in self ? new BroadcastChannel('sanda') : null;
  const subs = new Set();
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const put = (k, v) => {
    localStorage.setItem(k, JSON.stringify(v));
    ch?.postMessage(k);
    subs.forEach((f) => f(k));
  };
  const notify = (k) => subs.forEach((f) => f(k));
  ch && (ch.onmessage = (e) => notify(e.data));
  addEventListener('storage', (e) => e.key && notify(e.key));
  const watch = (match, cb) => { const f = (k) => match(k) && cb(); subs.add(f); cb(); return () => subs.delete(f); };
  const bk = (c) => `sanda:bout:${c}`;
  const jk = (c, n) => `sanda:judge:${c}:${n}`;

  return {
    async createBout(data) {
      const code = genCode();
      put(bk(code), { ...data, code, owner: 'local', createdAt: now() });
      const idx = get('sanda:index') || [];
      put('sanda:index', [code, ...idx].slice(0, 200));
      return code;
    },
    watchBout(code, cb) { return watch((k) => k === bk(code), () => cb(get(bk(code)))); },
    watchJudges(code, n, cb) {
      return watch((k) => k.startsWith(`sanda:judge:${code}:`), () => {
        const o = {}; for (let i = 1; i <= n; i++) o[i] = get(jk(code, i)); cb(o);
      });
    },
    watchJudge(code, n, cb) { return watch((k) => k === jk(code, n), () => cb(get(jk(code, n)))); },
    async updateBout(code, patch) { put(bk(code), { ...get(bk(code)), ...patch }); },
    async tap(code, n, round, side, delta) {
      const d = get(jk(code, n)) || { taps: {} };
      const r = (d.taps[round] ||= { rojo: 0, azul: 0 });
      r[side] = Math.max(0, (r[side] || 0) + delta);
      d.updatedAt = now();
      put(jk(code, n), d);
    },
    async listBouts() { return (get('sanda:index') || []).map((c) => get(bk(c))).filter(Boolean); },
  };
}

// ------------------------------------------------------------- FIREBASE
async function firebaseStore() {
  const V = '10.12.2';
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const auth = await import(`${base}/firebase-auth.js`);
  const rt = await import(`${base}/firebase-database.js`);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  const db = rt.getDatabase(app);
  rt.onValue(rt.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  const userP = new Promise((res, rej) => {
    const off = auth.onAuthStateChanged(a, (u) => { if (u) { off(); res(u); } });
    auth.signInAnonymously(a).catch(rej);
  });
  const bref = (c) => rt.ref(db, `combates/${c}`);
  const jref = (c, n) => rt.ref(db, `jueces/${c}/${n}`);
  // Espera la sesión antes de escuchar, para que las reglas de lectura se cumplan.
  const listen = (r, cb) => {
    let off = null, dead = false;
    userP.then(() => { if (!dead) off = rt.onValue(r, (s) => cb(s.val())); });
    return () => { dead = true; off && off(); };
  };

  return {
    async createBout(data) {
      const u = await userP;
      const code = genCode();
      await rt.set(bref(code), { ...data, code, owner: u.uid, createdAt: now() });
      return code;
    },
    watchBout(code, cb) { return listen(bref(code), (v) => cb(normBout(v))); },
    watchJudges(code, n, cb) {
      return listen(rt.ref(db, `jueces/${code}`), (v) => {
        const all = toObj(v); const o = {};
        for (let i = 1; i <= n; i++) o[i] = normJudge(all[i] || null);
        cb(o);
      });
    },
    watchJudge(code, n, cb) { return listen(jref(code, n), (v) => cb(normJudge(v))); },
    async updateBout(code, patch) { await userP; await rt.update(bref(code), patch); },
    async tap(code, n, round, side, delta) {
      await userP;
      await rt.update(jref(code, n), { [`taps/${round}/${side}`]: rt.increment(delta), updatedAt: rt.serverTimestamp() });
    },
    async listBouts() {
      const u = await userP;
      const q = rt.query(rt.ref(db, 'combates'), rt.orderByChild('owner'), rt.equalTo(u.uid), rt.limitToLast(50));
      const s = await rt.get(q);
      return Object.values(s.val() || {}).map(normBout).sort((x, y) => y.createdAt - x.createdAt);
    },
  };
}

export const store = await (useFirebase ? firebaseStore() : Promise.resolve(localStore()));
