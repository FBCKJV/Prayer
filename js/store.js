// store.js — all Firebase (Auth + Firestore) access lives here.
// The rest of the app never imports the Firebase SDK directly.
import { firebaseConfig } from './firebase-config.js';

const SDK = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${SDK}`;

export const isConfigured =
  !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('PASTE');

let _p = null;
async function init() {
  if (_p) return _p;
  _p = (async () => {
    const [app, auth, fs] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
    const instance = app.initializeApp(firebaseConfig);
    const authInst = auth.getAuth(instance);
    const db = fs.getFirestore(instance);
    return { auth, fs, authInst, db };
  })();
  return _p;
}

/* ── Auth ─────────────────────────────────────────────────────────────── */

// Fires cb(user|null) on every auth change. Returns unsubscribe.
export async function onAuth(cb) {
  const { auth, authInst } = await init();
  return auth.onAuthStateChanged(authInst, cb);
}

export async function signIn(email, password) {
  const { auth, authInst } = await init();
  await auth.signInWithEmailAndPassword(authInst, email.trim(), password);
}

export async function signOutUser() {
  const { auth, authInst } = await init();
  await auth.signOut(authInst);
}

// Create the auth account, then the user profile doc. The Firestore rules
// reject the profile write unless inviteCode matches config/invite, so a bad
// code leaves an orphaned auth account with no access — we delete it so the
// person can retry cleanly.
export async function signUp({ name, email, password, inviteCode }) {
  const { auth, authInst, fs, db } = await init();
  const cred = await auth.createUserWithEmailAndPassword(authInst, email.trim(), password);
  try {
    await fs.setDoc(fs.doc(db, 'users', cred.user.uid), {
      name: name.trim(),
      email: email.trim(),
      inviteCode: inviteCode.trim(),
      createdAt: fs.serverTimestamp(),
    });
  } catch (err) {
    try { await auth.deleteUser(cred.user); } catch (_) {}
    if (err && err.code === 'permission-denied') {
      const e = new Error('That invite code is not valid. Ask a leader for the current code.');
      e.code = 'bad-invite';
      throw e;
    }
    throw err;
  }
}

export async function getProfile(uid) {
  const { fs, db } = await init();
  const snap = await fs.getDoc(fs.doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// A short-lived Firebase ID token for the signed-in user, used to prove
// membership to the push-notification Worker.
export async function getIdToken() {
  const { authInst } = await init();
  const u = authInst.currentUser;
  return u ? u.getIdToken() : null;
}

/* ── Members / moderation ─────────────────────────────────────────────── */

// Live member directory, oldest first. cb receives an array of member objects
// ({ id, name, email, role, createdAt }). Every member may read this.
export async function watchMembers(cb, onError) {
  const { fs, db } = await init();
  const q = fs.query(fs.collection(db, 'users'), fs.orderBy('createdAt', 'asc'));
  return fs.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

// Revoke a member's access (moderator only, enforced by rules). Removing the
// member doc immediately cuts off all read/write; their login still exists but
// grants nothing. Fully delete the login in the Firebase console if desired.
export async function removeMember(uid) {
  const { fs, db } = await init();
  await fs.deleteDoc(fs.doc(db, 'users', uid));
}

/* ── Weekly prayer list (standing, moderator-edited) ──────────────────── */

// Live-watch the standing list document. cb receives the doc data (or null
// if it hasn't been saved yet — the caller falls back to the seed).
export async function watchPrayerList(cb, onError) {
  const { fs, db } = await init();
  return fs.onSnapshot(fs.doc(db, 'lists', 'weekly'), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  }, onError);
}

// Save the standing list (moderator only, enforced by rules).
export async function savePrayerList(sections) {
  const { fs, db, authInst } = await init();
  const user = authInst.currentUser;
  const prof = await getProfile(user.uid);
  await fs.setDoc(fs.doc(db, 'lists', 'weekly'), {
    sections,
    updatedAt: fs.serverTimestamp(),
    updatedBy: (prof && prof.name) || 'A moderator',
  });
}

/* ── Prayers ──────────────────────────────────────────────────────────── */

// Live feed, newest first. cb receives an array of prayer objects.
// Filtering (urgent/answered/mine) is done by the caller in JS so we only
// ever need Firestore's automatic single-field index on createdAt.
export async function watchPrayers(cb, onError) {
  const { fs, db } = await init();
  const q = fs.query(fs.collection(db, 'prayers'), fs.orderBy('createdAt', 'desc'), fs.limit(300));
  return fs.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function postPrayer({ title, body, category, urgent }) {
  const { fs, db, authInst } = await init();
  const user = authInst.currentUser;
  const prof = await getProfile(user.uid);
  await fs.addDoc(fs.collection(db, 'prayers'), {
    uid: user.uid,
    author: (prof && prof.name) || 'A member',
    title: (title || '').trim(),
    body: body.trim(),
    category: category || 'General',
    urgent: !!urgent,
    answered: false,
    prayedBy: [],
    commentCount: 0,
    createdAt: fs.serverTimestamp(),
  });
}

export async function togglePraying(prayerId, uid, isOn) {
  const { fs, db } = await init();
  const ref = fs.doc(db, 'prayers', prayerId);
  await fs.updateDoc(ref, {
    prayedBy: isOn ? fs.arrayRemove(uid) : fs.arrayUnion(uid),
  });
}

export async function setAnswered(prayerId, answered) {
  const { fs, db } = await init();
  await fs.updateDoc(fs.doc(db, 'prayers', prayerId), { answered: !!answered });
}

export async function deletePrayer(prayerId) {
  const { fs, db } = await init();
  await fs.deleteDoc(fs.doc(db, 'prayers', prayerId));
}

/* ── Comments (prayer chain updates) ──────────────────────────────────── */

export async function watchComments(prayerId, cb, onError) {
  const { fs, db } = await init();
  const q = fs.query(
    fs.collection(db, 'prayers', prayerId, 'comments'),
    fs.orderBy('createdAt', 'asc')
  );
  return fs.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function addComment(prayerId, body) {
  const { fs, db, authInst } = await init();
  const user = authInst.currentUser;
  const prof = await getProfile(user.uid);
  await fs.addDoc(fs.collection(db, 'prayers', prayerId, 'comments'), {
    uid: user.uid,
    author: (prof && prof.name) || 'A member',
    body: body.trim(),
    createdAt: fs.serverTimestamp(),
  });
  // Best-effort count bump for the collapsed card badge.
  try {
    await fs.updateDoc(fs.doc(db, 'prayers', prayerId), { commentCount: fs.increment(1) });
  } catch (_) {}
}

// Delete a comment (by its author, the prayer's author, or a moderator).
export async function deleteComment(prayerId, commentId) {
  const { fs, db } = await init();
  await fs.deleteDoc(fs.doc(db, 'prayers', prayerId, 'comments', commentId));
  try {
    await fs.updateDoc(fs.doc(db, 'prayers', prayerId), { commentCount: fs.increment(-1) });
  } catch (_) {}
}

export function currentUid(user) {
  return user && user.uid;
}
