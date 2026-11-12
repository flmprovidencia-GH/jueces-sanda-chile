// Capa de datos. Dos modos con la misma interfaz:
//  - "firebase": Firestore en tiempo real (producción, entre celulares).
//  - "local": localStorage + BroadcastChannel (demo/pruebas en un mismo navegador).
import { firebaseConfig } from './firebase-config.js';

const useFirebase = !!(firebaseConfig && firebaseConfig.apiKey);
export const MODE = useFirebase ? 'firebase' : 'local';

function genCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

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
    async ready() { return { uid: 'local' }; },
    async createBout(data) {
      const code = genCode();
      put(bk(code), { ...data, code, owner: 'local', createdAt: Date.now() });
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
    async updateBout(code, patch) { put(bk(code), { ...get(bk(code)), ...patch }); },
    async tap(code, n, round, side, delta) {
      const d = get(jk(code, n)) || { taps: {} };
      const r = (d.taps[round] ||= { rojo: 0, azul: 0 });
      r[side] = Math.max(0, (r[side] || 0) + delta);
      d.updatedAt = Date.now();
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
  const fs = await import(`${base}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  const db = fs.getFirestore(app);
  const userP = new Promise((res, rej) => {
    const off = auth.onAuthStateChanged(a, (u) => { if (u) { off(); res(u); } });
    auth.signInAnonymously(a).catch(rej);
  });
  const bref = (c) => fs.doc(db, 'combates', c);
  const jref = (c, n) => fs.doc(db, 'combates', c, 'jueces', String(n));

  return {
    async ready() { return userP; },
    async createBout(data) {
      const u = await userP;
      const code = genCode();
      await fs.setDoc(bref(code), { ...data, code, owner: u.uid, createdAt: Date.now() });
      return code;
    },
    watchBout(code, cb) { return fs.onSnapshot(bref(code), (s) => cb(s.exists() ? s.data() : null)); },
    watchJudges(code, n, cb) {
      return fs.onSnapshot(fs.collection(db, 'combates', code, 'jueces'), (qs) => {
        const o = {}; for (let i = 1; i <= n; i++) o[i] = null;
        qs.forEach((d) => { o[d.id] = d.data(); }); cb(o);
      });
    },
    async updateBout(code, patch) { await fs.updateDoc(bref(code), patch); },
    async tap(code, n, round, side, delta) {
      await fs.setDoc(jref(code, n), { taps: { [round]: { [side]: fs.increment(delta) } }, updatedAt: Date.now() }, { merge: true });
    },
    async listBouts() {
      const u = await userP;
      const q = fs.query(fs.collection(db, 'combates'), fs.where('owner', '==', u.uid), fs.limit(100));
      const qs = await fs.getDocs(q);
      return qs.docs.map((d) => d.data()).sort((x, y) => y.createdAt - x.createdAt);
    },
  };
}

export const store = await (useFirebase ? firebaseStore() : Promise.resolve(localStore()));
