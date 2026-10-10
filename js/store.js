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

// Email a password-reset link (Firebase Auth handles the email + reset page).
// Works whenever an auth account exists for the address, regardless of whether
// the person still has a membership doc.
export async function sendPasswordReset(email) {
  const { auth, authInst } = await init();
  await auth.sendPasswordResetEmail(authInst, email.trim());
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

// Revoke a member's access (moderator only, enforced by rules). We flag the
// member rather than deleting their doc, so a moderator can restore them later.
// The flag cuts off all read/write immediately; their login is untouched.
export async function removeMember(uid) {
  const { fs, db, authInst } = await init();
  const prof = await getProfile(authInst.currentUser.uid);
  await fs.updateDoc(fs.doc(db, 'users', uid), {
    removed: true,
    removedAt: fs.serverTimestamp(),
    removedBy: (prof && prof.name) || 'A moderator',
  });
}

// Restore a previously-removed member (moderator only). Clears the flag so
// their access returns. Their password is unchanged — if they'd forgotten it,
// they use "Forgot your password?" to set a new one.
export async function restoreMember(uid) {
  const { fs, db, authInst } = await init();
  const prof = await getProfile(authInst.currentUser.uid);
  await fs.updateDoc(fs.doc(db, 'users', uid), {
    removed: false,
    restoredAt: fs.serverTimestamp(),
    restoredBy: (prof && prof.name) || 'A moderator',
  });
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

// Edit an existing request (author or moderator, enforced by rules).
export async function updatePrayer(prayerId, { title, body, category, urgent }) {
  const { fs, db } = await init();
  await fs.updateDoc(fs.doc(db, 'prayers', prayerId), {
    title: (title || '').trim(),
    body: body.trim(),
    category: category || 'General',
    urgent: !!urgent,
    editedAt: fs.serverTimestamp(),
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

// Toggle a ❤️ on a comment (acknowledge / thank someone for kind words).
export async function toggleCommentHeart(prayerId, commentId, uid, isOn) {
  const { fs, db } = await init();
  const ref = fs.doc(db, 'prayers', prayerId, 'comments', commentId);
  await fs.updateDoc(ref, {
    heartedBy: isOn ? fs.arrayRemove(uid) : fs.arrayUnion(uid),
  });
}

// Delete a comment (by its author, the prayer's author, or a moderator).
export async function deleteComment(prayerId, commentId) {
  const { fs, db } = await init();
  await fs.deleteDoc(fs.doc(db, 'prayers', prayerId, 'comments', commentId));
  try {
    await fs.updateDoc(fs.doc(db, 'prayers', prayerId), { commentCount: fs.increment(-1) });
  } catch (_) {}
}

/* ── Church messages (pastor & moderators post; everyone can 👍) ─────────── */

// Live message board, newest first.
export async function watchAnnouncements(cb, onError) {
  const { fs, db } = await init();
  const q = fs.query(fs.collection(db, 'announcements'), fs.orderBy('createdAt', 'desc'), fs.limit(50));
  return fs.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

// A message can carry one calendar date ("Add to calendar"). The two docs
// point at each other (announcement.eventId ↔ event.announcementId) and are
// always written, edited and deleted together in one batch. The message keeps
// its own copy of the date/time/place so Messages can show it without
// loading the calendar.
function eventFields(title, ev) {
  return {
    title: title.trim(), date: ev.date, time: ev.time || '',
    location: (ev.location || '').trim(), notes: '', repeat: '', until: '',
  };
}
function annEventFields(ev) {
  return ev
    ? { eventDate: ev.date, eventTime: ev.time || '', eventLocation: (ev.location || '').trim() }
    : { eventId: '', eventDate: '', eventTime: '', eventLocation: '' };
}

// Post a message (church leaders, enforced by rules). event: optional
// { date, time, location } to also put it on the calendar.
export async function postAnnouncement({ title, body, event }) {
  const { fs, db, authInst } = await init();
  const user = authInst.currentUser;
  const prof = await getProfile(user.uid);
  const author = (prof && prof.name) || 'Church office';
  const annRef = fs.doc(fs.collection(db, 'announcements'));
  const batch = fs.writeBatch(db);
  let eventId = '';
  if (event) {
    const evRef = fs.doc(fs.collection(db, 'events'));
    eventId = evRef.id;
    batch.set(evRef, {
      ...eventFields(title, event), announcementId: annRef.id,
      uid: user.uid, author, createdAt: fs.serverTimestamp(),
    });
  }
  batch.set(annRef, {
    uid: user.uid, author,
    title: (title || '').trim(), body: body.trim(),
    thumbsBy: [], createdAt: fs.serverTimestamp(),
    ...annEventFields(event), eventId,
  });
  await batch.commit();
}

// Edit a message and keep its calendar date in step: add, change or remove it.
// prevEventId: the message's current eventId ('' if none).
export async function updateAnnouncement(id, { title, body, event }, prevEventId) {
  const { fs, db, authInst } = await init();
  const annRef = fs.doc(db, 'announcements', id);
  const batch = fs.writeBatch(db);
  let eventId = prevEventId || '';
  if (event && eventId) {
    batch.update(fs.doc(db, 'events', eventId), { ...eventFields(title, event), updatedAt: fs.serverTimestamp() });
  } else if (event) {
    const user = authInst.currentUser;
    const prof = await getProfile(user.uid);
    const evRef = fs.doc(fs.collection(db, 'events'));
    eventId = evRef.id;
    batch.set(evRef, {
      ...eventFields(title, event), announcementId: id,
      uid: user.uid, author: (prof && prof.name) || 'Church office', createdAt: fs.serverTimestamp(),
    });
  } else if (eventId) {
    batch.delete(fs.doc(db, 'events', eventId));
    eventId = '';
  }
  batch.update(annRef, {
    title: (title || '').trim(), body: body.trim(), editedAt: fs.serverTimestamp(),
    ...annEventFields(event), eventId,
  });
  await batch.commit();
}

export async function toggleThumbs(id, uid, isOn) {
  const { fs, db } = await init();
  await fs.updateDoc(fs.doc(db, 'announcements', id), {
    thumbsBy: isOn ? fs.arrayRemove(uid) : fs.arrayUnion(uid),
  });
}

// Deleting a message also removes its calendar date (and vice versa below).
export async function deleteAnnouncement(id, eventId) {
  const { fs, db } = await init();
  const batch = fs.writeBatch(db);
  batch.delete(fs.doc(db, 'announcements', id));
  if (eventId) batch.delete(fs.doc(db, 'events', eventId));
  await batch.commit();
}

/* ── Church calendar (pastor & moderators add dates) ──────────────────── */

export const REPEATS = ['weekly', 'biweekly', 'monthly', 'monthly_nth'];

// Live calendar. Two listeners merged into one list: one-off events on or
// after sinceDate ('YYYY-MM-DD'), plus every repeating series no matter when
// it started (a weekly service that began years ago still shows today).
// Dates are plain local-date strings so they sort and never shift by zone.
export async function watchEvents(sinceDate, cb, onError) {
  const { fs, db } = await init();
  const col = fs.collection(db, 'events');
  let recent = [], series = [];
  const emit = () => {
    const byId = new Map();
    for (const e of [...recent, ...series]) byId.set(e.id, e);
    cb([...byId.values()]);
  };
  const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const u1 = fs.onSnapshot(
    fs.query(col, fs.where('date', '>=', sinceDate), fs.orderBy('date', 'asc'), fs.limit(500)),
    (snap) => { recent = toList(snap); emit(); }, onError);
  const u2 = fs.onSnapshot(
    fs.query(col, fs.where('repeat', 'in', REPEATS), fs.limit(200)),
    (snap) => { series = toList(snap); emit(); }, onError);
  return () => { u1(); u2(); };
}

// Create (id = null) or update an event.
// repeat: '' | 'weekly' | 'biweekly' | 'monthly' | 'monthly_nth';
// until: optional last date ('YYYY-MM-DD') for a repeating series.
export async function saveEvent(id, { title, date, time, location, notes, repeat, until }) {
  const { fs, db, authInst } = await init();
  const data = {
    title: title.trim(),
    date,
    time: time || '',
    location: (location || '').trim(),
    notes: (notes || '').trim(),
    repeat: REPEATS.includes(repeat) ? repeat : '',
    until: repeat && until ? until : '',
  };
  if (id) {
    await fs.updateDoc(fs.doc(db, 'events', id), { ...data, updatedAt: fs.serverTimestamp() });
    return;
  }
  const user = authInst.currentUser;
  const prof = await getProfile(user.uid);
  await fs.addDoc(fs.collection(db, 'events'), {
    ...data,
    uid: user.uid,
    author: (prof && prof.name) || 'Church office',
    createdAt: fs.serverTimestamp(),
  });
}

// Leave one date out of a repeating series (e.g. no service on a holiday).
export async function skipEventDate(id, date) {
  const { fs, db } = await init();
  await fs.updateDoc(fs.doc(db, 'events', id), {
    skip: fs.arrayUnion(date),
    updatedAt: fs.serverTimestamp(),
  });
}

export async function deleteEvent(id, announcementId) {
  const { fs, db } = await init();
  const batch = fs.writeBatch(db);
  batch.delete(fs.doc(db, 'events', id));
  if (announcementId) batch.delete(fs.doc(db, 'announcements', announcementId));
  await batch.commit();
}

export function currentUid(user) {
  return user && user.uid;
}
