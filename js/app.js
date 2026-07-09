// app.js — UI controller. Wires the DOM to store.js.
import * as store from './store.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  topbar: $('.topbar'),
  who: $('#who'),
  signOut: $('#signOutBtn'),
  setupBanner: $('#setupBanner'),
  authView: $('#authView'),
  feedView: $('#feedView'),
  tabSignIn: $('#tabSignIn'),
  tabSignUp: $('#tabSignUp'),
  authForm: $('#authForm'),
  name: $('#nameInput'),
  email: $('#emailInput'),
  password: $('#passwordInput'),
  invite: $('#inviteInput'),
  authError: $('#authError'),
  authSubmit: $('#authSubmit'),
  newPrayer: $('#newPrayerBtn'),
  feedList: $('#feedList'),
  feedEmpty: $('#feedEmpty'),
  feedTabs: $('.feed-tabs'),
  composer: $('#composer'),
  composerForm: $('#composerForm'),
  composerCancel: $('#composerCancel'),
  composerError: $('#composerError'),
  cTitle: $('#cTitle'),
  cBody: $('#cBody'),
  cCategory: $('#cCategory'),
  cUrgent: $('#cUrgent'),
};

let mode = 'signin';          // 'signin' | 'signup'
let currentUser = null;       // firebase user
let prayers = [];             // latest snapshot
let filter = 'all';
let unsubPrayers = null;
const openComments = new Map(); // prayerId -> { unsub, listEl }

/* ── helpers ──────────────────────────────────────────────────────────── */

function timeAgo(ts) {
  if (!ts || !ts.toDate) return 'just now';
  const d = ts.toDate();
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  if (code === 'bad-invite') return err.message;
  if (code.includes('email-already-in-use')) return 'That email already has an account. Try signing in.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Email or password is incorrect.';
  if (code.includes('invalid-email')) return 'That email address looks invalid.';
  if (code.includes('weak-password')) return 'Please use a password of at least 6 characters.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a moment and try again.';
  if (code.includes('network')) return 'Network problem. Check your connection and try again.';
  return (err && err.message) || 'Something went wrong. Please try again.';
}

/* ── auth UI ──────────────────────────────────────────────────────────── */

function setMode(next) {
  mode = next;
  const signup = next === 'signup';
  els.tabSignIn.classList.toggle('is-active', !signup);
  els.tabSignUp.classList.toggle('is-active', signup);
  document.querySelectorAll('.signup-only').forEach((n) => (n.hidden = !signup));
  els.name.required = signup;
  els.invite.required = signup;
  els.password.autocomplete = signup ? 'new-password' : 'current-password';
  els.authSubmit.textContent = signup ? 'Join the chain' : 'Sign in';
  showError(els.authError, '');
}

els.tabSignIn.addEventListener('click', () => setMode('signin'));
els.tabSignUp.addEventListener('click', () => setMode('signup'));

els.authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(els.authError, '');
  els.authSubmit.disabled = true;
  const prev = els.authSubmit.textContent;
  els.authSubmit.textContent = 'Please wait…';
  try {
    if (mode === 'signup') {
      await store.signUp({
        name: els.name.value,
        email: els.email.value,
        password: els.password.value,
        inviteCode: els.invite.value,
      });
    } else {
      await store.signIn(els.email.value, els.password.value);
    }
    // onAuth handler swaps views.
  } catch (err) {
    showError(els.authError, friendlyAuthError(err));
    els.authSubmit.disabled = false;
    els.authSubmit.textContent = prev;
  }
});

els.signOut.addEventListener('click', async () => {
  try { await store.signOutUser(); } catch (_) {}
});

/* ── feed ─────────────────────────────────────────────────────────────── */

els.feedTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  filter = btn.dataset.filter;
  els.feedTabs.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === btn));
  renderFeed();
});

function visiblePrayers() {
  const uid = currentUser && currentUser.uid;
  switch (filter) {
    case 'urgent': return prayers.filter((p) => p.urgent && !p.answered);
    case 'answered': return prayers.filter((p) => p.answered);
    case 'mine': return prayers.filter((p) => p.uid === uid);
    default: return prayers;
  }
}

function renderFeed() {
  const list = visiblePrayers();
  els.feedList.innerHTML = '';
  if (!list.length) {
    els.feedEmpty.hidden = false;
    els.feedEmpty.innerHTML =
      '<span class="big">🕊️</span>' +
      (filter === 'all'
        ? 'No prayer requests yet. Be the first to share one.'
        : 'Nothing here yet.');
    return;
  }
  els.feedEmpty.hidden = true;
  const frag = document.createDocumentFragment();
  for (const p of list) frag.appendChild(buildCard(p));
  els.feedList.appendChild(frag);
  // Re-attach any comment threads that were open before the re-render.
  for (const [id, rec] of openComments) {
    const card = els.feedList.querySelector(`[data-id="${id}"]`);
    if (card) card.querySelector('.comments').classList.add('open');
    else { rec.unsub && rec.unsub(); openComments.delete(id); }
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function buildCard(p) {
  const uid = currentUser && currentUser.uid;
  const mine = p.uid === uid;
  const prayed = Array.isArray(p.prayedBy) && p.prayedBy.includes(uid);
  const count = Array.isArray(p.prayedBy) ? p.prayedBy.length : 0;

  const card = el('article', 'card');
  card.dataset.id = p.id;
  if (p.urgent && !p.answered) card.classList.add('is-urgent');
  if (p.answered) card.classList.add('is-answered');

  // head tags
  const head = el('div', 'card-head');
  head.appendChild(el('span', 'tag cat', p.category || 'General'));
  if (p.urgent && !p.answered) head.appendChild(el('span', 'tag urgent', 'Urgent'));
  if (p.answered) head.appendChild(el('span', 'tag answered', '✓ Answered'));
  card.appendChild(head);

  if (p.title) card.appendChild(el('h3', 'card-title', p.title));
  card.appendChild(el('p', 'card-body', p.body || ''));

  const meta = el('div', 'card-meta');
  meta.appendChild(el('span', null, p.author || 'A member'));
  meta.appendChild(el('span', null, '·'));
  meta.appendChild(el('span', null, timeAgo(p.createdAt)));
  card.appendChild(meta);

  // actions
  const actions = el('div', 'card-actions');
  const prayBtn = el('button', 'pray-btn' + (prayed ? ' is-on' : ''));
  prayBtn.type = 'button';
  prayBtn.innerHTML = `<span aria-hidden="true">🙏</span> <span>${prayed ? 'Praying' : 'I prayed'}</span> <span class="pray-count">${count || ''}</span>`;
  prayBtn.addEventListener('click', () => onPray(p, prayed, prayBtn));
  actions.appendChild(prayBtn);

  const commentToggle = el('button', 'link-btn');
  commentToggle.type = 'button';
  const cc = p.commentCount || 0;
  commentToggle.textContent = cc ? `💬 Updates (${cc})` : '💬 Add update';
  commentToggle.addEventListener('click', () => toggleComments(p.id, card));
  actions.appendChild(commentToggle);

  actions.appendChild(el('span', 'spacer'));

  if (mine) {
    const ans = el('button', 'link-btn');
    ans.type = 'button';
    ans.textContent = p.answered ? 'Reopen' : 'Mark answered';
    ans.addEventListener('click', async () => {
      try { await store.setAnswered(p.id, !p.answered); } catch (_) {}
    });
    actions.appendChild(ans);

    const del = el('button', 'link-btn danger');
    del.type = 'button';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this prayer request?')) return;
      closeComments(p.id);
      try { await store.deletePrayer(p.id); } catch (_) {}
    });
    actions.appendChild(del);
  }
  card.appendChild(actions);

  // comments container
  const comments = el('div', 'comments');
  const listEl = el('div', 'comment-list');
  comments.appendChild(listEl);
  const cForm = document.createElement('form');
  cForm.className = 'comment-form';
  const cInput = document.createElement('input');
  cInput.type = 'text';
  cInput.maxLength = 1000;
  cInput.placeholder = 'Share an update or encouragement…';
  cForm.appendChild(cInput);
  const cSend = el('button', 'btn btn-primary', 'Send');
  cSend.type = 'submit';
  cForm.appendChild(cSend);
  cForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = cInput.value.trim();
    if (!text) return;
    cInput.value = '';
    try { await store.addComment(p.id, text); }
    catch (_) { cInput.value = text; }
  });
  comments.appendChild(cForm);
  card.appendChild(comments);

  return card;
}

async function onPray(p, prayed, btn) {
  const uid = currentUser && currentUser.uid;
  if (!uid) return;
  btn.disabled = true;
  try { await store.togglePraying(p.id, uid, prayed); }
  catch (_) {} finally { btn.disabled = false; }
}

function renderComments(listEl, items) {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.appendChild(el('p', 'comment-body', 'No updates yet. Be an encouragement.'));
    return;
  }
  for (const c of items) {
    const wrap = el('div', 'comment');
    const head = document.createElement('div');
    head.appendChild(el('span', 'comment-author', c.author || 'A member'));
    head.appendChild(el('span', 'comment-time', timeAgo(c.createdAt)));
    wrap.appendChild(head);
    wrap.appendChild(el('div', 'comment-body', c.body || ''));
    listEl.appendChild(wrap);
  }
}

function toggleComments(id, card) {
  if (openComments.has(id)) { closeComments(id); return; }
  const box = card.querySelector('.comments');
  const listEl = box.querySelector('.comment-list');
  box.classList.add('open');
  const rec = { unsub: null, listEl };
  openComments.set(id, rec);
  store.watchComments(id, (items) => renderComments(listEl, items), () => {})
    .then((unsub) => { rec.unsub = unsub; });
}

function closeComments(id) {
  const rec = openComments.get(id);
  if (!rec) return;
  rec.unsub && rec.unsub();
  openComments.delete(id);
  const card = els.feedList.querySelector(`[data-id="${id}"]`);
  if (card) card.querySelector('.comments').classList.remove('open');
}

/* ── composer ─────────────────────────────────────────────────────────── */

els.newPrayer.addEventListener('click', () => {
  showError(els.composerError, '');
  els.composerForm.reset();
  if (typeof els.composer.showModal === 'function') els.composer.showModal();
});
els.composerCancel.addEventListener('click', () => els.composer.close());

els.composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = els.cBody.value.trim();
  if (!body) { showError(els.composerError, 'Please write your request.'); return; }
  els.composer.querySelector('#composerSubmit').disabled = true;
  try {
    await store.postPrayer({
      title: els.cTitle.value,
      body,
      category: els.cCategory.value,
      urgent: els.cUrgent.checked,
    });
    els.composer.close();
  } catch (err) {
    showError(els.composerError, 'Could not post. ' + friendlyAuthError(err));
  } finally {
    els.composer.querySelector('#composerSubmit').disabled = false;
  }
});

/* ── view switching ───────────────────────────────────────────────────── */

function showAuthView() {
  els.topbar.hidden = true;
  els.feedView.hidden = true;
  els.authView.hidden = false;
}

async function showFeedView() {
  const user = currentUser;
  els.authView.hidden = true;
  els.topbar.hidden = false;
  els.feedView.hidden = false;
  els.feedEmpty.hidden = false;
  els.feedEmpty.innerHTML = '<span class="big">🕊️</span>Loading the prayer chain…';
  // Just after signup, the auth listener fires before the membership doc has
  // finished writing. Reading the profile (and thus becoming a "member") can
  // fail for a moment — wait for it to appear before attaching the live feed.
  let prof = null;
  for (let i = 0; i < 8 && currentUser === user; i++) {
    prof = await store.getProfile(user.uid).catch(() => null);
    if (prof || currentUser !== user) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (currentUser !== user) return; // signed out / changed while waiting
  els.who.textContent = (prof && prof.name) || user.email || '';
  if (!unsubPrayers) {
    unsubPrayers = await store.watchPrayers(
      (items) => { prayers = items; renderFeed(); },
      () => {}
    );
  }
}

/* ── boot ─────────────────────────────────────────────────────────────── */

async function boot() {
  setMode('signin');
  if (!store.isConfigured) {
    els.setupBanner.hidden = false;
    els.authView.hidden = false;
    els.authForm.querySelectorAll('input, button').forEach((n) => (n.disabled = true));
    return;
  }
  try {
    await store.onAuth(async (user) => {
      currentUser = user;
      if (user) {
        await showFeedView();
      } else {
        if (unsubPrayers) { unsubPrayers(); unsubPrayers = null; }
        for (const id of [...openComments.keys()]) closeComments(id);
        prayers = [];
        els.authSubmit.disabled = false;
        setMode(mode);
        showAuthView();
      }
    });
  } catch (err) {
    els.setupBanner.hidden = false;
    els.setupBanner.innerHTML = '<strong>Could not reach Firebase.</strong> Double-check the values in <code>js/firebase-config.js</code>.';
    els.authView.hidden = false;
  }
}

boot();
