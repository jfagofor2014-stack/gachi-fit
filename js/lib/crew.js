import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const CREW_PATH = ['crews', 'main', 'plans'];

let ctx = null;
let initTried = false;

// 設定値がプレースホルダのままなら未設定とみなす
export function isCrewConfigured() {
  return Object.values(firebaseConfig).every((v) => v && v !== 'REPLACE_ME');
}

// SDK を動的 import して初期化する。未設定・読み込み失敗時は null を返す
export async function initCrew() {
  if (ctx) return ctx;
  if (initTried) return null;
  initTried = true;
  if (!isCrewConfigured()) return null;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    let db;
    try {
      db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({}) });
    } catch {
      db = fsMod.getFirestore(app);
    }
    ctx = { auth: authMod.getAuth(app), db, authMod, fsMod };
    return ctx;
  } catch {
    return null;
  }
}

// サインイン状態を購読する。購読解除関数を返す（未設定時は何もしない関数）
export async function watchAuth(cb) {
  const c = await initCrew();
  if (!c) { cb(null); return () => {}; }
  return c.authMod.onAuthStateChanged(c.auth, (u) =>
    cb(u ? { email: u.email, displayName: u.displayName || u.email } : null));
}

export async function signIn() {
  const c = await initCrew();
  if (!c) throw new Error('共有機能が設定されていません');
  await c.authMod.signInWithPopup(c.auth, new c.authMod.GoogleAuthProvider());
}

export async function signOutCrew() {
  const c = await initCrew();
  if (!c) return;
  await c.authMod.signOut(c.auth);
}

function plansCol(c) {
  return c.fsMod.collection(c.db, ...CREW_PATH);
}

// 予定を購読する。購読解除関数を返す
export async function watchPlans(cb) {
  const c = await initCrew();
  if (!c) return () => {};
  return c.fsMod.onSnapshot(
    plansCol(c),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => cb([])
  );
}

export async function savePlan(plan) {
  const c = await initCrew();
  if (!c) throw new Error('共有機能が設定されていません');
  const { id, ...data } = plan;
  data.updatedAt = Date.now();
  if (id) {
    await c.fsMod.updateDoc(c.fsMod.doc(c.db, ...CREW_PATH, id), data);
  } else {
    await c.fsMod.addDoc(plansCol(c), data);
  }
}

export async function deletePlan(id) {
  const c = await initCrew();
  if (!c) throw new Error('共有機能が設定されていません');
  await c.fsMod.deleteDoc(c.fsMod.doc(c.db, ...CREW_PATH, id));
}
