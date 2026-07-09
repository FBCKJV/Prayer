// app.js — UI controller. Wires the DOM to store.js.
import * as store from './store.js';
import * as notify from './notify.js';

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
  membersBtn: $('#membersBtn'),
  membersDialog: $('#membersDialog'),
  membersClose: $('#membersClose'),
  membersList: $('#membersList'),
  membersNote: $('#membersNote'),
  notifyBar: $('#notifyBar'),
  notifyBtn: $('#notifyBtn'),
  notifyDismiss: $('#notifyDismiss'),
  bellBtn: $('#bellBtn'),
  menuBtn: $('#menuBtn'),
  menu: $('#menu'),
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
let unsubMembers = null;
let members = [];             // live member directory
let roleByUid = {};           // uid -> role ('admin' for moderators)
let isAdmin = false;          // is the signed-in user a moderator?
const openComments = new Map(); // prayerId -> { unsub, listEl }
const expandedCards = new Set(); // prayerIds currently expanded

function isModerator(uid) {
  return roleByUid[uid] === 'admin';
}
function moderatorBadge() {
  return el('span', 'mod-badge', 'Moderator');
}

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
  closeMenu();
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

function snippet(text, n) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function buildCard(p) {
  const uid = currentUser && currentUser.uid;
  const mine = p.uid === uid;
  const prayed = Array.isArray(p.prayedBy) && p.prayedBy.includes(uid);
  const count = Array.isArray(p.prayedBy) ? p.prayedBy.length : 0;
  const isOpen = expandedCards.has(p.id);

  const card = el('article', 'card');
  card.dataset.id = p.id;
  if (p.urgent && !p.answered) card.classList.add('is-urgent');
  if (p.answered) card.classList.add('is-answered');
  if (isOpen) card.classList.add('expanded');

  // ── collapsed summary (always visible; tap to expand) ──
  const summary = el('button', 'card-summary');
  summary.type = 'button';
  summary.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

  const head = el('div', 'card-head');
  head.appendChild(el('span', 'tag cat', p.category || 'General'));
  if (p.urgent && !p.answered) head.appendChild(el('span', 'tag urgent', 'Urgent'));
  if (p.answered) head.appendChild(el('span', 'tag answered', '✓ Answered'));
  summary.appendChild(head);

  const line = el('div', 'card-line');
  const label = (p.title && p.title.trim()) ? p.title.trim() : snippet(p.body, 60);
  line.appendChild(el('span', 'card-label', label));
  const who = el('span', 'card-who');
  who.appendChild(document.createTextNode(' — '));
  const author = el('span', null, p.author || 'A member');
  if (isModerator(p.uid)) author.appendChild(moderatorBadge());
  who.appendChild(author);
  line.appendChild(who);
  summary.appendChild(line);

  const sub = el('div', 'card-subline');
  sub.appendChild(el('span', null, timeAgo(p.createdAt)));
  if (count) sub.appendChild(el('span', null, `· 🙏 ${count}`));
  if (p.commentCount) sub.appendChild(el('span', null, `· 💬 ${p.commentCount}`));
  summary.appendChild(sub);

  summary.appendChild(el('span', 'chevron', '▾'));
  summary.addEventListener('click', () => toggleExpand(p.id, card, summary));
  card.appendChild(summary);

  // ── expanded detail ──
  const detail = el('div', 'card-detail');
  detail.appendChild(el('p', 'card-body', p.body || ''));

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
  commentToggle.addEventListener('click', () => toggleComments(p, card));
  actions.appendChild(commentToggle);

  actions.appendChild(el('span', 'spacer'));

  // The author can answer/delete their own request; a moderator can act on any.
  if (mine || isAdmin) {
    const ans = el('button', 'link-btn');
    ans.type = 'button';
    ans.textContent = p.answered ? 'Reopen' : 'Mark answered';
    ans.addEventListener('click', async () => {
      const marking = !p.answered;
      try {
        await store.setAnswered(p.id, marking);
        if (marking) notify.sendPush('answered'); // only on answer, not reopen
      } catch (_) {}
    });
    actions.appendChild(ans);

    const del = el('button', 'link-btn danger');
    del.type = 'button';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      const msg = mine ? 'Delete this prayer request?'
        : 'Delete this member’s prayer request as a moderator?';
      if (!confirm(msg)) return;
      closeComments(p.id);
      try { await store.deletePrayer(p.id); } catch (_) {}
    });
    actions.appendChild(del);
  }
  detail.appendChild(actions);

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
  detail.appendChild(comments);

  card.appendChild(detail);
  return card;
}

function toggleExpand(id, card, summary) {
  const open = expandedCards.has(id);
  if (open) { expandedCards.delete(id); card.classList.remove('expanded'); }
  else { expandedCards.add(id); card.classList.add('expanded'); }
  summary.setAttribute('aria-expanded', open ? 'false' : 'true');
}

async function onPray(p, prayed, btn) {
  const uid = currentUser && currentUser.uid;
  if (!uid) return;
  btn.disabled = true;
  try { await store.togglePraying(p.id, uid, prayed); }
  catch (_) {} finally { btn.disabled = false; }
}

function renderComments(listEl, items, prayer) {
  const uid = currentUser && currentUser.uid;
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.appendChild(el('p', 'comment-body', 'No updates yet. Be an encouragement.'));
    return;
  }
  for (const c of items) {
    const wrap = el('div', 'comment');
    const head = document.createElement('div');
    const author = el('span', 'comment-author', c.author || 'A member');
    if (isModerator(c.uid)) author.appendChild(moderatorBadge());
    head.appendChild(author);
    head.appendChild(el('span', 'comment-time', timeAgo(c.createdAt)));
    // Deletable by its author, the prayer's author, or a moderator.
    if (c.uid === uid || isAdmin || prayer.uid === uid) {
      const del = el('button', 'link-btn danger', '✕');
      del.type = 'button';
      del.title = 'Delete update';
      del.addEventListener('click', async () => {
        if (!confirm('Delete this update?')) return;
        try { await store.deleteComment(prayer.id, c.id); } catch (_) {}
      });
      head.appendChild(del);
    }
    wrap.appendChild(head);
    wrap.appendChild(el('div', 'comment-body', c.body || ''));
    listEl.appendChild(wrap);
  }
}

function toggleComments(prayer, card) {
  const id = prayer.id;
  if (openComments.has(id)) { closeComments(id); return; }
  const box = card.querySelector('.comments');
  const listEl = box.querySelector('.comment-list');
  box.classList.add('open');
  const rec = { unsub: null, listEl };
  openComments.set(id, rec);
  store.watchComments(id, (items) => renderComments(listEl, items, prayer), () => {})
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
    notify.sendPush('new_prayer'); // fire-and-forget; Worker notifies the chain
  } catch (err) {
    showError(els.composerError, 'Could not post. ' + friendlyAuthError(err));
  } finally {
    els.composer.querySelector('#composerSubmit').disabled = false;
  }
});

/* ── members / moderation ─────────────────────────────────────────────── */

function memberJoined(ts) {
  if (!ts || !ts.toDate) return '';
  return 'Joined ' + ts.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderMembers() {
  const uid = currentUser && currentUser.uid;
  els.membersNote.textContent = isAdmin
    ? 'You’re a moderator. You can see everyone and revoke access. Removing a member cuts off their access immediately.'
    : `${members.length} member${members.length === 1 ? '' : 's'}. Everyone here posts under their real name — there are no private messages.`;
  els.membersList.innerHTML = '';
  for (const m of members) {
    const row = el('div', 'member');
    const info = el('div', 'member-info');
    const name = el('div', 'member-name', m.name || 'A member');
    if (m.role === 'admin') name.appendChild(moderatorBadge());
    info.appendChild(name);
    // Names + join dates are visible to all; emails only to moderators.
    const sub = [memberJoined(m.createdAt)];
    if (isAdmin && m.email) sub.unshift(m.email);
    info.appendChild(el('div', 'member-sub', sub.filter(Boolean).join(' · ')));
    row.appendChild(info);

    if (m.id === uid) {
      row.appendChild(el('span', 'member-you', 'You'));
    } else if (isAdmin) {
      const rm = el('button', 'member-remove', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', async () => {
        const warn = m.role === 'admin'
          ? `Remove moderator ${m.name}? They’ll lose all access.`
          : `Remove ${m.name} from the prayer chain? They’ll lose all access immediately.`;
        if (!confirm(warn)) return;
        rm.disabled = true;
        try { await store.removeMember(m.id); }
        catch (_) { rm.disabled = false; alert('Could not remove this member.'); }
      });
      row.appendChild(rm);
    }
    els.membersList.appendChild(row);
  }
}

/* ── header overflow menu ─────────────────────────────────────────────── */

function closeMenu() {
  els.menu.hidden = true;
  els.menuBtn.setAttribute('aria-expanded', 'false');
}
els.menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !els.menu.hidden;
  els.menu.hidden = open;
  els.menuBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
});
document.addEventListener('click', (e) => {
  if (!els.menu.hidden && !e.target.closest('.menu-wrap')) closeMenu();
});

els.membersBtn.addEventListener('click', () => {
  closeMenu();
  renderMembers();
  if (typeof els.membersDialog.showModal === 'function') els.membersDialog.showModal();
});
els.membersClose.addEventListener('click', () => els.membersDialog.close());

/* ── notifications opt-in ─────────────────────────────────────────────── */

const NOTIFY_DISMISS = 'fbcprayer_notify_dismissed';

function notifGranted() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
function notifBlocked() {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}
function updateBell() {
  if (!notify.pushConfigured) { els.bellBtn.hidden = true; return; }
  els.bellBtn.hidden = false;
  const on = notifGranted();
  els.bellBtn.classList.toggle('on', on);
  els.bellBtn.title = on ? 'Prayer alerts are on' : 'Turn on prayer alerts';
}

async function setupNotifications(uid) {
  if (!notify.pushConfigured) return;
  notify.pushLogin(uid); // tie this browser's subscription to the member
  updateBell();
  if (localStorage.getItem(NOTIFY_DISMISS) || notifGranted()) return;
  try {
    if (await notify.pushNeedsPermission()) els.notifyBar.hidden = false;
  } catch (_) {}
}

// The bell is the always-available way to turn alerts on (the bar is just a
// one-time nudge). Works even after the bar was dismissed.
els.bellBtn.addEventListener('click', async () => {
  if (notifGranted()) {
    alert('Prayer alerts are already on for this device. To turn them off, use your browser/phone notification settings for this site.');
    return;
  }
  if (notifBlocked()) {
    alert('Notifications are blocked for this site.\n\nTo turn them on:\n• Chrome (Android): tap the ⋮ menu → Site settings → Notifications → Allow. Or tap the 🔒/ⓘ icon left of the address bar → Permissions → Notifications → Allow.\n• Then come back and tap the bell again.');
    return;
  }
  els.bellBtn.disabled = true;
  try { await notify.promptEnable(); } catch (_) {}
  els.bellBtn.disabled = false;
  els.notifyBar.hidden = true;
  updateBell();
});

els.notifyBtn.addEventListener('click', async () => {
  els.notifyBtn.disabled = true;
  try { await notify.promptEnable(); } catch (_) {}
  els.notifyBtn.disabled = false;
  els.notifyBar.hidden = true;
  updateBell();
});
els.notifyDismiss.addEventListener('click', () => {
  els.notifyBar.hidden = true;
  localStorage.setItem(NOTIFY_DISMISS, '1');
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
  isAdmin = !!(prof && prof.role === 'admin');
  setupNotifications(user.uid);
  if (!unsubPrayers) {
    unsubPrayers = await store.watchPrayers(
      (items) => { prayers = items; renderFeed(); },
      () => {}
    );
  }
  if (!unsubMembers) {
    unsubMembers = await store.watchMembers(
      (list) => {
        members = list;
        roleByUid = {};
        for (const m of list) roleByUid[m.id] = m.role;
        // A moderator's role could change live; keep our own flag in sync.
        isAdmin = roleByUid[user.uid] === 'admin';
        renderFeed();
        if (els.membersDialog.open) renderMembers();
      },
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
        if (unsubMembers) { unsubMembers(); unsubMembers = null; }
        for (const id of [...openComments.keys()]) closeComments(id);
        if (els.membersDialog.open) els.membersDialog.close();
        els.notifyBar.hidden = true;
        els.bellBtn.hidden = true;
        notify.pushLogout();
        prayers = [];
        members = [];
        roleByUid = {};
        isAdmin = false;
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

/* ── install ("Add to Home Screen") ───────────────────────────────────── */

(function installPrompt() {
  const bar = $('#installBar');
  const iosHelp = $('#iosHelp');
  const DISMISS = 'fbcprayer_install_dismissed';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone || localStorage.getItem(DISMISS)) return; // already installed or dismissed

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (bar) bar.hidden = false;
  });
  window.addEventListener('appinstalled', () => { if (bar) bar.hidden = true; });

  const installBtn = $('#installBtn');
  if (installBtn) installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    if (bar) bar.hidden = true;
  });
  const dismiss = $('#installDismiss');
  if (dismiss) dismiss.addEventListener('click', () => {
    if (bar) bar.hidden = true;
    localStorage.setItem(DISMISS, '1');
  });

  // iOS Safari has no beforeinstallprompt — show a short how-to instead.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && iosHelp) {
    iosHelp.hidden = false;
    const x = $('#iosDismiss');
    if (x) x.addEventListener('click', () => { iosHelp.hidden = true; localStorage.setItem(DISMISS, '1'); });
  }
})();

boot();
