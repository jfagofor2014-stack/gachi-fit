import { firebaseConfig } from './firebase-config.js';
import { localDateStr } from './localdate.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const CREW_PATH = ['crews', 'main', 'plans'];

let initPromise = null;

// 設定値がプレースホルダのままなら未設定とみなす
export function isCrewConfigured() {
  return Object.values(firebaseConfig).every((v) => v && v !== 'REPLACE_ME');
}

async function doInit() {
  if (!isCrewConfigured()) return null;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  let db;
  try {
    db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({}) });
  } catch {
    db = fsMod.getFirestore(app);
  }
  return { auth, db, authMod, fsMod };
}

// SDK を動的 import して初期化する。未設定・読み込み失敗時は null を返す。
// 進行中の初期化は共有し、失敗した場合のみ次回に再試行できるようにする
export function initCrew() {
  if (!initPromise) {
    initPromise = doInit().catch(() => { initPromise = null; return null; });
  }
  return initPromise;
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

// 予定を購読する。購読解除関数を返す。cb(plans, err) の err は権限エラー等
export async function watchPlans(cb) {
  const c = await initCrew();
  if (!c) return () => {};
  const q = c.fsMod.query(plansCol(c), c.fsMod.where('date', '>=', localDateStr()));
  return c.fsMod.onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })), null),
    (err) => cb([], err)
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
