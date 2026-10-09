// app.js — UI controller. Wires the DOM to store.js.
import * as store from './store.js';
import * as notify from './notify.js';
import { LIST_SECTIONS, LIST_SEED } from './prayer-list-seed.js';

const $ = (sel) => document.querySelector(sel);

// Bump this when you deploy a notable change (shown in the About dialog).
const APP_VERSION = '1.1 (build 27)';
const BASE_TITLE = document.title;

const els = {
  topbar: $('.topbar'),
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
  forgotRow: $('#forgotRow'),
  forgotBtn: $('#forgotBtn'),
  membersBtn: $('#membersBtn'),
  membersDialog: $('#membersDialog'),
  membersClose: $('#membersClose'),
  membersList: $('#membersList'),
  membersNote: $('#membersNote'),
  notifyBar: $('#notifyBar'),
  notifyBtn: $('#notifyBtn'),
  notifyDismiss: $('#notifyDismiss'),
  notifyMenuBtn: $('#notifyMenuBtn'),
  menuBtn: $('#menuBtn'),
  menu: $('#menu'),
  aboutBtn: $('#aboutBtn'),
  aboutDialog: $('#aboutDialog'),
  aboutClose: $('#aboutClose'),
  aboutVer: $('#aboutVer'),
  listNavBtn: $('#listNavBtn'),
  listView: $('#listView'),
  listBack: $('#listBack'),
  listEdit: $('#listEdit'),
  listSave: $('#listSave'),
  listCancel: $('#listCancel'),
  listPrint: $('#listPrint'),
  printArea: $('#printArea'),
  listBody: $('#listBody'),
  listEditor: $('#listEditor'),
  listMeta: $('#listMeta'),
  listError: $('#listError'),
  newPrayer: $('#newPrayerBtn'),
  feedList: $('#feedList'),
  feedEmpty: $('#feedEmpty'),
  feedTabs: $('.feed-tabs'),
  composer: $('#composer'),
  composerForm: $('#composerForm'),
  composerTitle: $('#composer .dialog-title'),
  composerSubmit: $('#composerSubmit'),
  composerCancel: $('#composerCancel'),
  composerError: $('#composerError'),
  cTitle: $('#cTitle'),
  cBody: $('#cBody'),
  cCategory: $('#cCategory'),
  cUrgent: $('#cUrgent'),
  mainNav: $('.main-nav'),
  msgDot: $('#msgDot'),
  messagesView: $('#messagesView'),
  newMsg: $('#newMsgBtn'),
  msgList: $('#msgList'),
  msgEmpty: $('#msgEmpty'),
  msgComposer: $('#msgComposer'),
  msgForm: $('#msgForm'),
  msgFormTitle: $('#msgFormTitle'),
  msgSubmit: $('#msgSubmit'),
  msgCancel: $('#msgCancel'),
  msgError: $('#msgError'),
  mTitle: $('#mTitle'),
  mBody: $('#mBody'),
  mNotify: $('#mNotify'),
  mNotifyRow: $('#mNotifyRow'),
  calendarView: $('#calendarView'),
  calPrev: $('#calPrev'),
  calNext: $('#calNext'),
  calToday: $('#calToday'),
  calMonth: $('#calMonth'),
  calGrid: $('#calGrid'),
  calDayTitle: $('#calDayTitle'),
  calDayList: $('#calDayList'),
  calUpcoming: $('#calUpcoming'),
  newEvent: $('#newEventBtn'),
  eventComposer: $('#eventComposer'),
  eventForm: $('#eventForm'),
  eventFormTitle: $('#eventFormTitle'),
  eventSubmit: $('#eventSubmit'),
  eventCancel: $('#eventCancel'),
  eventError: $('#eventError'),
  eTitle: $('#eTitle'),
  eDate: $('#eDate'),
  eTime: $('#eTime'),
  eLocation: $('#eLocation'),
  eNotes: $('#eNotes'),
  eRepeat: $('#eRepeat'),
  eUntil: $('#eUntil'),
  eUntilRow: $('#eUntilRow'),
  eNotify: $('#eNotify'),
  eNotifyRow: $('#eNotifyRow'),
};

let mode = 'signin';          // 'signin' | 'signup'
let currentUser = null;       // firebase user
let prayers = [];             // latest snapshot
let filter = 'all';
let unsubPrayers = null;
let unsubMembers = null;
let unsubList = null;         // weekly prayer list watcher
let listData = null;         // saved list doc (null → use seed)
let feedLoaded = false;      // has the prayers listener delivered yet?
let members = [];             // live member directory
let roleByUid = {};           // uid -> role ('admin' for moderators)
let isAdmin = false;          // is the signed-in user a moderator (admin)?
let isEditor = false;      // church leader (admin or pastor): edits the Weekly
                              // Prayer List, posts messages, manages the calendar
let section = 'prayer';       // 'prayer' | 'messages' | 'calendar'
let announcements = [];       // latest church messages snapshot
let msgsLoaded = false;
let unsubMsgs = null;
let events = [];              // latest calendar snapshot
let eventsLoaded = false;
let unsubEvents = null;
let memberReady = false;      // membership confirmed; safe to attach listeners
const openComments = new Map(); // prayerId -> { unsub, listEl }
const expandedCards = new Set(); // prayerIds currently expanded
const autoExpandedIds = new Set(); // newest cards we've already auto-opened once

// A public role badge for a member (Moderator or Pastor), or null.
function roleBadge(uid) {
  const r = roleByUid[uid];
  if (r === 'admin') return el('span', 'mod-badge', 'Moderator');
  if (r === 'pastor') return el('span', 'mod-badge pastor', 'Pastor');
  return null;
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
  el.classList.remove('ok'); // errors are never styled as the green confirmation
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
  els.forgotRow.hidden = signup; // only relevant when signing in
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

els.forgotBtn.addEventListener('click', async () => {
  const email = (els.email.value || '').trim();
  if (!email || !email.includes('@')) {
    showError(els.authError, 'Type your email address above first, then tap “Forgot your password?”');
    els.email.focus();
    return;
  }
  showError(els.authError, '');
  els.forgotBtn.disabled = true;
  const prev = els.forgotBtn.textContent;
  els.forgotBtn.textContent = 'Sending…';
  const confirm = () => {
    showError(els.authError, '');
    els.authError.hidden = false;
    els.authError.classList.add('ok');
    els.authError.textContent = 'If an account uses ' + email +
      ', a reset link is on its way. Check your inbox (and spam).';
  };
  try {
    await store.sendPasswordReset(email);
    confirm();
  } catch (err) {
    // Report success even when the address has no account, so we never reveal
    // who is or isn't a member. Only surface genuine problems (network,
    // too many attempts, malformed address).
    const code = (err && err.code) || '';
    if (code.includes('user-not-found')) { confirm(); }
    else { showError(els.authError, friendlyAuthError(err)); }
  } finally {
    els.forgotBtn.disabled = false;
    els.forgotBtn.textContent = prev;
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
  { const rb = roleBadge(p.uid); if (rb) author.appendChild(rb); }
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
  // Your own post: you "add an update". Someone else's: you "leave encouragement".
  const emptyLabel = mine ? '💬 Add update' : '💬 Leave encouragement';
  commentToggle.textContent = cc ? `💬 Updates (${cc})` : emptyLabel;
  commentToggle.addEventListener('click', () => toggleComments(p, card));
  actions.appendChild(commentToggle);

  actions.appendChild(el('span', 'spacer'));

  // The author can edit/answer/delete their own request; a moderator can act on any.
  if (mine || isAdmin) {
    const edit = el('button', 'link-btn');
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openComposer(p));
    actions.appendChild(edit);

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
    { const rb = roleBadge(c.uid); if (rb) author.appendChild(rb); }
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

    // ❤️ react — acknowledge / thank someone for an encouraging reply.
    const hearted = Array.isArray(c.heartedBy) && c.heartedBy.includes(uid);
    const hearts = Array.isArray(c.heartedBy) ? c.heartedBy.length : 0;
    const heartBtn = el('button', 'heart-btn' + (hearted ? ' is-on' : ''));
    heartBtn.type = 'button';
    heartBtn.title = hearted ? 'Remove your heart' : 'Heart this reply';
    heartBtn.innerHTML = `<span aria-hidden="true">❤️</span><span class="heart-count">${hearts || ''}</span>`;
    heartBtn.addEventListener('click', async () => {
      if (!uid) return;
      heartBtn.disabled = true;
      try { await store.toggleCommentHeart(prayer.id, c.id, uid, hearted); }
      catch (_) {} finally { heartBtn.disabled = false; }
    });
    const actions = el('div', 'comment-actions');
    actions.appendChild(heartBtn);
    wrap.appendChild(actions);

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

let editingId = null; // set when the composer is editing an existing request

// Open the composer for a new request (prayer = null) or to edit an existing one.
function openComposer(prayer) {
  showError(els.composerError, '');
  els.composerForm.reset();
  editingId = prayer ? prayer.id : null;
  if (prayer) {
    els.composerTitle.textContent = 'Edit prayer request';
    els.composerSubmit.textContent = 'Save changes';
    els.cTitle.value = prayer.title || '';
    els.cBody.value = prayer.body || '';
    els.cCategory.value = prayer.category || 'General';
    els.cUrgent.checked = !!prayer.urgent;
  } else {
    els.composerTitle.textContent = 'Share a prayer request';
    els.composerSubmit.textContent = 'Post to the chain';
  }
  if (typeof els.composer.showModal === 'function') els.composer.showModal();
}

els.newPrayer.addEventListener('click', () => openComposer(null));
els.composerCancel.addEventListener('click', () => els.composer.close());

els.composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = els.cBody.value.trim();
  if (!body) { showError(els.composerError, 'Please write your request.'); return; }
  const data = {
    title: els.cTitle.value,
    body,
    category: els.cCategory.value,
    urgent: els.cUrgent.checked,
  };
  els.composerSubmit.disabled = true;
  try {
    if (editingId) {
      await store.updatePrayer(editingId, data);
    } else {
      await store.postPrayer(data);
      notify.sendPush('new_prayer'); // fire-and-forget; Worker notifies the chain
    }
    els.composer.close();
  } catch (err) {
    showError(els.composerError, (editingId ? 'Could not save. ' : 'Could not post. ') + friendlyAuthError(err));
  } finally {
    els.composerSubmit.disabled = false;
  }
});

/* ── members / moderation ─────────────────────────────────────────────── */

function memberJoined(ts) {
  if (!ts || !ts.toDate) return '';
  return 'Joined ' + ts.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderMembers() {
  const uid = currentUser && currentUser.uid;
  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);
  els.membersNote.textContent = isAdmin
    ? 'You’re a moderator. Removing a member cuts off their access right away, but keeps their record so you can restore them here anytime. A restored member signs in with their old password — or uses “Forgot your password?” if they’ve forgotten it.'
    : `${active.length} member${active.length === 1 ? '' : 's'}. Everyone here posts under their real name — there are no private messages.`;
  els.membersList.innerHTML = '';

  for (const m of active) {
    const row = el('div', 'member');
    const info = el('div', 'member-info');
    const name = el('div', 'member-name', m.name || 'A member');
    { const rb = roleBadge(m.id); if (rb) name.appendChild(rb); }
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
          ? `Remove moderator ${m.name}? They’ll lose all access. You can restore them here later.`
          : `Remove ${m.name} from the prayer chain? They’ll lose access immediately. You can restore them here later.`;
        if (!confirm(warn)) return;
        rm.disabled = true;
        try { await store.removeMember(m.id); }
        catch (_) { rm.disabled = false; alert('Could not remove this member.'); }
      });
      row.appendChild(rm);
    }
    els.membersList.appendChild(row);
  }

  // Removed members — moderators only. Kept on record so they can be restored.
  if (isAdmin && removed.length) {
    els.membersList.appendChild(el('div', 'members-heading', 'Removed'));
    for (const m of removed) {
      const row = el('div', 'member is-removed');
      const info = el('div', 'member-info');
      info.appendChild(el('div', 'member-name', m.name || 'A member'));
      const sub = [`removed${m.removedBy ? ' by ' + m.removedBy : ''}`];
      if (m.email) sub.unshift(m.email);
      info.appendChild(el('div', 'member-sub', sub.filter(Boolean).join(' · ')));
      row.appendChild(info);

      const rs = el('button', 'member-restore', 'Restore');
      rs.type = 'button';
      rs.addEventListener('click', async () => {
        if (!confirm(`Restore ${m.name}? Their access returns right away. They sign in with their old password, or use “Forgot your password?” if they’ve forgotten it.`)) return;
        rs.disabled = true;
        try { await store.restoreMember(m.id); }
        catch (_) { rs.disabled = false; alert('Could not restore this member.'); }
      });
      row.appendChild(rs);
      els.membersList.appendChild(row);
    }
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

/* ── about / help ─────────────────────────────────────────────────────── */

els.aboutBtn.addEventListener('click', () => {
  closeMenu();
  els.aboutVer.textContent = 'Version ' + APP_VERSION;
  if (typeof els.aboutDialog.showModal === 'function') els.aboutDialog.showModal();
});
els.aboutClose.addEventListener('click', () => els.aboutDialog.close());

/* ── weekly prayer list ───────────────────────────────────────────────── */

function currentSections() {
  // Once a moderator has saved, that doc is the single source of truth;
  // the seed is only used until the first save.
  return listData ? (listData.sections || {}) : LIST_SEED;
}

function renderListRead() {
  const sections = currentSections();
  els.listBody.innerHTML = '';
  for (const cat of LIST_SECTIONS) {
    const items = String(sections[cat] || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const sec = el('section', 'list-section');
    sec.appendChild(el('h3', null, cat));
    if (items.length) {
      const ul = document.createElement('ul');
      for (const it of items) ul.appendChild(el('li', null, it));
      sec.appendChild(ul);
    } else {
      sec.appendChild(el('p', 'empty-note', '(none listed)'));
    }
    els.listBody.appendChild(sec);
  }
  els.listMeta.textContent = listData && listData.updatedAt && listData.updatedAt.toDate
    ? `Updated ${listData.updatedAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} by ${listData.updatedBy || 'a moderator'}`
    : 'Standing list — updated by the church office.';
}

function renderListEditor() {
  const sections = currentSections();
  els.listEditor.innerHTML = '';
  for (const cat of LIST_SECTIONS) {
    const field = el('div', 'ed-field');
    const label = el('label', null, cat);
    label.htmlFor = 'ed-' + cat;
    const ta = document.createElement('textarea');
    ta.id = 'ed-' + cat;
    ta.dataset.cat = cat;
    ta.rows = Math.min(Math.max(String(sections[cat] || '').split('\n').length + 1, 3), 20);
    ta.value = String(sections[cat] || '');
    field.appendChild(label);
    field.appendChild(ta);
    els.listEditor.appendChild(field);
  }
  const hint = el('p', 'ed-hint', 'One prayer request per line. Empty sections show “(none listed)”.');
  els.listEditor.appendChild(hint);
}

function setListMode(editing) {
  els.listBody.hidden = editing;
  els.listMeta.hidden = editing;
  els.listEditor.hidden = !editing;
  els.listEdit.hidden = editing || !isEditor;
  els.listSave.hidden = !editing;
  els.listCancel.hidden = !editing;
  els.listPrint.hidden = editing;
  showError(els.listError, '');
}

// Printable Weekly Prayer List — reproduces the church's landscape, two-panel,
// double-sided half-sheet. Panel A (verse + Lost/Praise/Health) and Panel B
// (Government/Church/Missionaries/Unspoken + Other-requests fill-in lines) are
// each a 5.5x8.5 sheet; front = A|B, back = B|A, so a duplex print cut down the
// middle makes two identical two-sided prayer sheets.
const PRINT_VERSE_REF = 'Philippians 4:6';
const PRINT_VERSE = 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.';
const PANEL_A_CATS = ['The Lost', 'Praise', 'Health'];
const PANEL_B_CATS = ['Government', 'Church', 'Missionaries', 'Unspoken', 'Other'];

function printCatLine(cat, sections) {
  const items = String(sections[cat] || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const label = cat === 'Other' ? 'Other requests:' : cat + ':';
  const p = el('p', 'pp-cat');
  p.appendChild(el('strong', null, label + ' '));
  if (items.length) p.appendChild(document.createTextNode(items.join('  -  ')));
  return p;
}

function buildPanel(cats, sections, withHeader) {
  const panel = el('div', 'pp-panel');
  const wm = document.createElement('img');
  wm.className = 'pp-wm'; wm.src = './assets/logo-display.png'; wm.alt = '';
  panel.appendChild(wm);
  const content = el('div', 'pp-content');
  if (withHeader) {
    const v = el('p', 'pp-verse');
    v.appendChild(el('strong', null, PRINT_VERSE_REF + ' — '));
    v.appendChild(document.createTextNode(PRINT_VERSE));
    content.appendChild(v);
    content.appendChild(el('p', 'pp-date', 'Date: ___ / ___ / _____'));
  }
  for (const cat of cats) content.appendChild(printCatLine(cat, sections));
  panel.appendChild(content);
  // Write-in lines that auto-fill the rest of the panel: more text above →
  // fewer lines, less text → more lines (overflow past the page is clipped).
  const fill = el('div', 'pp-fill');
  for (let i = 0; i < 40; i++) fill.appendChild(el('div', 'pp-line'));
  panel.appendChild(fill);
  return panel;
}

function buildSheet(leftCats, leftHeader, rightCats, rightHeader, sections) {
  const s = el('div', 'pp-sheet');
  s.appendChild(buildPanel(leftCats, sections, leftHeader));
  s.appendChild(el('div', 'pp-divider'));
  s.appendChild(buildPanel(rightCats, sections, rightHeader));
  return s;
}

function printPrayerList() {
  const sections = currentSections();
  els.printArea.innerHTML = '';
  // Both pages are A | B. Printed double-sided with "flip on LONG edge", the
  // back is mirrored left-to-right, so each half ends up A (front) / B (back).
  // Cut down the middle → two identical two-sided prayer sheets.
  els.printArea.appendChild(buildSheet(PANEL_A_CATS, true, PANEL_B_CATS, false, sections));
  els.printArea.appendChild(buildSheet(PANEL_A_CATS, true, PANEL_B_CATS, false, sections));
  // "Save as PDF" names the file after the page title, so title it with the
  // six-digit date (MMDDYY) of the Wednesday it's for: today if it's
  // Wednesday, otherwise the coming one. e.g. "FBC Prayer List 101426.pdf"
  const wed = new Date();
  wed.setDate(wed.getDate() + ((3 - wed.getDay() + 7) % 7));
  const stamp = pad2(wed.getMonth() + 1) + pad2(wed.getDate()) + pad2(wed.getFullYear() % 100);
  const prevTitle = document.title;
  document.title = `FBC Prayer List ${stamp}`;
  const restore = () => { document.title = prevTitle; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

function showListView() {
  els.feedView.hidden = true;
  els.messagesView.hidden = true;
  els.calendarView.hidden = true;
  els.listView.hidden = false;
  setListMode(false);
  renderListRead();
  // Live-watch the list; refresh the read view when it changes (unless the
  // moderator is mid-edit). watchPrayerList resolves to an unsubscribe fn.
  if (!unsubList) {
    store.watchPrayerList(
      (data) => { listData = data; if (els.listEditor.hidden) renderListRead(); },
      () => {}
    ).then((u) => {
      if (els.listView.hidden) u(); // left before it resolved
      else unsubList = u;
    });
  }
}

function closeListView() {
  if (unsubList) { unsubList(); unsubList = null; }
  document.title = BASE_TITLE; // in case printing changed it and never restored
  els.listView.hidden = true;
}

function leaveListView() {
  closeListView();
  showSection('prayer');
}

els.listNavBtn.addEventListener('click', () => { closeMenu(); showListView(); });
els.listBack.addEventListener('click', () => leaveListView());
els.listPrint.addEventListener('click', printPrayerList);
els.listEdit.addEventListener('click', () => { renderListEditor(); setListMode(true); });
els.listCancel.addEventListener('click', () => { renderListRead(); setListMode(false); });
els.listSave.addEventListener('click', async () => {
  const sections = {};
  els.listEditor.querySelectorAll('textarea').forEach((ta) => {
    sections[ta.dataset.cat] = ta.value.replace(/\n{3,}/g, '\n\n').trim();
  });
  els.listSave.disabled = true;
  showError(els.listError, '');
  try {
    await store.savePrayerList(sections);
    // listData will refresh via the watcher; render immediately too.
    setListMode(false);
    renderListRead();
  } catch (err) {
    showError(els.listError, 'Could not save. ' + friendlyAuthError(err));
  } finally {
    els.listSave.disabled = false;
  }
});

/* ── sections (Prayer / Messages / Calendar) ──────────────────────────── */

const SECTIONS = ['prayer', 'messages', 'calendar'];

function sectionFromHash() {
  const h = (location.hash || '').replace('#', '');
  return SECTIONS.includes(h) ? h : 'prayer';
}

// Deep link for push notifications, e.g. https://prayer.fbckjv.app/#messages
function sectionUrl(name) {
  return location.origin + location.pathname + '#' + name;
}

function showSection(name) {
  if (!SECTIONS.includes(name)) name = 'prayer';
  section = name;
  if (!els.listView.hidden) closeListView();
  els.feedView.hidden = name !== 'prayer';
  els.messagesView.hidden = name !== 'messages';
  els.calendarView.hidden = name !== 'calendar';
  els.mainNav.querySelectorAll('.main-tab').forEach((t) => {
    const on = t.dataset.section === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const hash = name === 'prayer' ? '' : '#' + name;
  if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
  if (name === 'messages') { markMessagesSeen(); renderMessages(); }
  if (name === 'calendar') { startEvents(); renderCalendar(); }
  window.scrollTo(0, 0);
}

els.mainNav.addEventListener('click', (e) => {
  const btn = e.target.closest('.main-tab');
  if (btn) showSection(btn.dataset.section);
});
// Tapping a notification while the app is already open changes only the hash.
window.addEventListener('hashchange', () => {
  if (currentUser && !els.topbar.hidden) showSection(sectionFromHash());
});

function nameOf(uid) {
  const m = members.find((x) => x.id === uid);
  return (m && m.name) || 'A member';
}

/* ── church messages ──────────────────────────────────────────────────── */

const MSG_SEEN = 'fbcprayer_msgs_seen';

function tsMillis(ts) {
  return ts && ts.toMillis ? ts.toMillis() : 0;
}

// Show a dot on the Messages tab when there's a message newer than the last
// time this device looked (and it isn't one you posted yourself).
function updateMsgDot() {
  const uid = currentUser && currentUser.uid;
  const seen = Number(localStorage.getItem(MSG_SEEN) || 0);
  const unread = announcements.some((m) => m.uid !== uid && tsMillis(m.createdAt) > seen);
  els.msgDot.hidden = !unread || section === 'messages';
}

function markMessagesSeen() {
  const newest = announcements.reduce((n, m) => Math.max(n, tsMillis(m.createdAt)), 0);
  const seen = Number(localStorage.getItem(MSG_SEEN) || 0);
  if (newest > seen) localStorage.setItem(MSG_SEEN, String(newest));
  updateMsgDot();
}

function renderMessages() {
  els.newMsg.hidden = !isEditor;
  if (els.messagesView.hidden) return;
  els.msgList.innerHTML = '';
  if (!msgsLoaded) {
    els.msgEmpty.hidden = false;
    els.msgEmpty.innerHTML = '<span class="big">📣</span>Loading messages…';
    return;
  }
  if (!announcements.length) {
    els.msgEmpty.hidden = false;
    els.msgEmpty.innerHTML = '<span class="big">📣</span>' +
      (isEditor ? 'No messages yet. Post one for the church.' : 'No church messages yet.');
    return;
  }
  els.msgEmpty.hidden = true;
  const frag = document.createDocumentFragment();
  for (const m of announcements) frag.appendChild(buildMessage(m));
  els.msgList.appendChild(frag);
}

function buildMessage(m) {
  const uid = currentUser && currentUser.uid;
  const thumbs = Array.isArray(m.thumbsBy) ? m.thumbsBy : [];
  const on = thumbs.includes(uid);

  const card = el('article', 'card msg-card');
  const head = el('div', 'msg-head');
  const author = el('span', 'msg-author', m.author || 'Church office');
  { const rb = roleBadge(m.uid); if (rb) author.appendChild(rb); }
  head.appendChild(author);
  // Always show the posted date, so an old message never reads as new.
  const posted = m.createdAt && m.createdAt.toDate
    ? m.createdAt.toDate().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · '
    : '';
  head.appendChild(el('span', 'msg-time', posted + timeAgo(m.createdAt) + (m.editedAt ? ' · edited' : '')));
  card.appendChild(head);

  if (m.title) card.appendChild(el('h3', 'msg-title', m.title));
  card.appendChild(el('p', 'card-body', m.body || ''));

  const actions = el('div', 'card-actions');
  const tb = el('button', 'pray-btn thumbs-btn' + (on ? ' is-on' : ''));
  tb.type = 'button';
  tb.innerHTML = `<span aria-hidden="true">👍</span> <span class="pray-count">${thumbs.length || ''}</span>`;
  tb.setAttribute('aria-label', on ? 'Remove your thumbs up' : 'Thumbs up');
  if (thumbs.length) tb.title = thumbs.map(nameOf).join(', ');
  tb.addEventListener('click', async () => {
    if (!uid) return;
    tb.disabled = true;
    try { await store.toggleThumbs(m.id, uid, on); }
    catch (_) {} finally { tb.disabled = false; }
  });
  actions.appendChild(tb);
  if (thumbs.length) {
    actions.appendChild(el('span', 'thumbs-who', snippet(thumbs.map(nameOf).join(', '), 60)));
  }
  actions.appendChild(el('span', 'spacer'));

  if (isEditor) {
    const edit = el('button', 'link-btn', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openMsgComposer(m));
    actions.appendChild(edit);
    const del = el('button', 'link-btn danger', 'Delete');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this message for everyone?')) return;
      try { await store.deleteAnnouncement(m.id); } catch (_) { alert('Could not delete this message.'); }
    });
    actions.appendChild(del);
  }
  card.appendChild(actions);
  return card;
}

let editingMsgId = null;

function openMsgComposer(m) {
  showError(els.msgError, '');
  els.msgForm.reset();
  editingMsgId = m ? m.id : null;
  els.mNotifyRow.hidden = !!m; // edits never re-notify
  if (m) {
    els.msgFormTitle.textContent = 'Edit message';
    els.msgSubmit.textContent = 'Save changes';
    els.mTitle.value = m.title || '';
    els.mBody.value = m.body || '';
  } else {
    els.msgFormTitle.textContent = 'Post a message';
    els.msgSubmit.textContent = 'Post';
    els.mNotify.checked = true;
  }
  if (typeof els.msgComposer.showModal === 'function') els.msgComposer.showModal();
}

els.newMsg.addEventListener('click', () => openMsgComposer(null));
els.msgCancel.addEventListener('click', () => els.msgComposer.close());

els.msgForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = els.mBody.value.trim();
  if (!body) { showError(els.msgError, 'Please write your message.'); return; }
  const data = { title: els.mTitle.value, body };
  els.msgSubmit.disabled = true;
  try {
    if (editingMsgId) {
      await store.updateAnnouncement(editingMsgId, data);
    } else {
      await store.postAnnouncement(data);
      if (els.mNotify.checked) notify.sendPush('announcement', sectionUrl('messages'));
    }
    els.msgComposer.close();
  } catch (err) {
    showError(els.msgError, (editingMsgId ? 'Could not save. ' : 'Could not post. ') + friendlyAuthError(err));
  } finally {
    els.msgSubmit.disabled = false;
  }
});

/* ── church calendar ──────────────────────────────────────────────────── */

const pad2 = (n) => String(n).padStart(2, '0');
// Local-date 'YYYY-MM-DD' (never UTC, so "today" is the church's today).
function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function fmtDayLong(s) {
  return parseYmd(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/* Repeating events. A series is stored once (its first date + a `repeat`
   rule, optional `until`, and a `skip` list); the dates are worked out here.
   Day arithmetic uses whole UTC days so daylight-saving never shifts a date. */
const DAY = 86400000;
const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
const fromDayNum = (n) => { const d = new Date(n * DAY); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', 'last'];

// Which week of the month a date falls in: 0-3 = 1st-4th, 4 = last.
function nthOfMonth(s) {
  const d = parseYmd(s);
  const n = Math.floor((d.getDate() - 1) / 7);
  return n >= 4 ? 4 : n;
}
function ordinalDay(n) {
  const v = n % 100;
  return n + ((v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
}

// Plain-words rule, e.g. "Every Wednesday" or "Monthly on the 1st Sunday".
function repeatLabel(repeat, date) {
  const d = parseYmd(date);
  const wd = WEEKDAYS[d.getDay()];
  switch (repeat) {
    case 'weekly': return `Every ${wd}`;
    case 'biweekly': return `Every other ${wd}`;
    case 'monthly': return `Monthly on the ${ordinalDay(d.getDate())}`;
    case 'monthly_nth': return `Monthly on the ${ORDINALS[nthOfMonth(date)]} ${wd}`;
    default: return '';
  }
}

// Every date (YYYY-MM-DD) this event lands on between from and to, inclusive.
function datesOf(ev, from, to) {
  const start = ev.date;
  const last = ev.until && ev.until < to ? ev.until : to;
  if (!ev.repeat) return start >= from && start <= to ? [start] : [];
  if (last < start) return [];
  const skip = new Set(Array.isArray(ev.skip) ? ev.skip : []);
  const out = [];
  const lo = from > start ? from : start;
  if (ev.repeat === 'weekly' || ev.repeat === 'biweekly') {
    const step = ev.repeat === 'weekly' ? 7 : 14;
    const s0 = dayNum(start);
    let n = s0 + Math.ceil((dayNum(lo) - s0) / step) * step;
    for (const end = dayNum(last); n <= end; n += step) out.push(fromDayNum(n));
  } else {
    const s = parseYmd(start);
    const wd = s.getDay(), nth = nthOfMonth(start);
    const loD = parseYmd(lo);
    for (let y = loD.getFullYear(), m = loD.getMonth(); ; m++) {
      const first = new Date(y, m, 1);
      const key0 = ymd(first);
      if (key0 > last) break;
      let day;
      if (ev.repeat === 'monthly') {
        const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        day = s.getDate() <= dim ? s.getDate() : null; // no Feb 30th: skip that month
      } else {
        const firstWd = (wd - first.getDay() + 7) % 7 + 1; // first matching weekday
        const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        day = nth === 4 ? firstWd + Math.floor((dim - firstWd) / 7) * 7 : firstWd + nth * 7;
      }
      if (day) {
        const key = ymd(new Date(first.getFullYear(), first.getMonth(), day));
        if (key >= lo && key <= last) out.push(key);
      }
    }
  }
  return out.filter((k) => !skip.has(k));
}

// All occurrences between from and to, each a copy of its event with `date`
// set to that day (the series start stays in `seriesDate`).
function occurrences(from, to) {
  const out = [];
  for (const ev of events) {
    for (const date of datesOf(ev, from, to)) out.push({ ...ev, seriesDate: ev.date, date });
  }
  return out.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let calSelected = ymd(new Date());

function eventsOn(date) {
  return occurrences(date, date);
}

// Start watching the calendar the first time it's opened. Only events from
// about a year back onward are loaded, which keeps reads small.
function startEvents() {
  if (unsubEvents || !currentUser || !memberReady) return;
  const since = new Date(); since.setFullYear(since.getFullYear() - 1);
  const user = currentUser;
  unsubEvents = () => {}; // placeholder so we don't double-subscribe
  store.watchEvents(ymd(since), (items) => {
    eventsLoaded = true;
    events = items;
    renderCalendar();
  }, () => { eventsLoaded = true; renderCalendar(); })
    .then((u) => {
      if (currentUser !== user) u(); // signed out before it resolved
      else unsubEvents = u;
    });
}

function renderCalendar() {
  els.newEvent.hidden = !isEditor;
  if (els.calendarView.hidden) return;
  const today = ymd(new Date());
  els.calMonth.textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  els.calGrid.innerHTML = '';
  for (const w of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) els.calGrid.appendChild(el('div', 'cal-wd', w));
  const start = new Date(calMonth);
  start.setDate(1 - start.getDay()); // back up to Sunday
  const gridEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
  const withEvents = new Set(occurrences(ymd(start), ymd(gridEnd)).map((ev) => ev.date));
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== calMonth.getMonth()) break; // drop an all-next-month row
    const key = ymd(d);
    const cell = el('button', 'cal-day');
    cell.type = 'button';
    if (d.getMonth() !== calMonth.getMonth()) cell.classList.add('is-out');
    if (key === today) cell.classList.add('is-today');
    if (key === calSelected) cell.classList.add('is-selected');
    cell.appendChild(el('span', 'cal-num', String(d.getDate())));
    if (withEvents.has(key)) {
      cell.classList.add('has-events');
      cell.appendChild(el('span', 'cal-dot'));
    }
    cell.setAttribute('aria-label', fmtDayLong(key) + (withEvents.has(key) ? ', has events' : ''));
    cell.addEventListener('click', () => {
      calSelected = key;
      if (d.getMonth() !== calMonth.getMonth()) calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
    });
    els.calGrid.appendChild(cell);
  }

  // Selected day
  els.calDayTitle.textContent = calSelected === today ? 'Today · ' + fmtDayLong(calSelected) : fmtDayLong(calSelected);
  els.calDayList.innerHTML = '';
  const dayEvents = eventsOn(calSelected);
  if (dayEvents.length) for (const ev of dayEvents) els.calDayList.appendChild(buildEvent(ev, false));
  else els.calDayList.appendChild(el('p', 'event-empty', eventsLoaded ? 'Nothing on the calendar this day.' : 'Loading…'));

  // Coming up (today onward)
  els.calUpcoming.innerHTML = '';
  const horizon = new Date(); horizon.setDate(horizon.getDate() + 120);
  // A repeating series shows once here (its next date) so it can't crowd out
  // everything else; the calendar grid above still shows every date.
  const seen = new Set();
  const upcoming = occurrences(today, ymd(horizon))
    .filter((ev) => !seen.has(ev.id) && seen.add(ev.id))
    .slice(0, 10);
  if (upcoming.length) for (const ev of upcoming) els.calUpcoming.appendChild(buildEvent(ev, true));
  else els.calUpcoming.appendChild(el('p', 'event-empty', eventsLoaded ? 'No upcoming events yet.' : 'Loading…'));
}

function buildEvent(ev, showDate) {
  const row = el('div', 'event');
  if (showDate) {
    const d = parseYmd(ev.date);
    const badge = el('button', 'event-date');
    badge.type = 'button';
    badge.title = 'Show on calendar';
    badge.appendChild(el('span', 'event-mon', d.toLocaleDateString(undefined, { month: 'short' })));
    badge.appendChild(el('span', 'event-dom', String(d.getDate())));
    badge.addEventListener('click', () => {
      calSelected = ev.date;
      calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    row.appendChild(badge);
  }
  const info = el('div', 'event-info');
  info.appendChild(el('div', 'event-title', ev.title || 'Event'));
  const sub = [];
  if (showDate) sub.push(parseYmd(ev.date).toLocaleDateString(undefined, { weekday: 'short' }));
  if (ev.time) sub.push(fmtTime(ev.time));
  if (ev.location) sub.push(ev.location);
  if (sub.length) info.appendChild(el('div', 'event-sub', sub.join(' · ')));
  if (ev.repeat) {
    const until = ev.until ? ' until ' + parseYmd(ev.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    info.appendChild(el('div', 'event-repeat', '🔁 ' + repeatLabel(ev.repeat, ev.seriesDate || ev.date) + until));
  }
  if (ev.notes) info.appendChild(el('div', 'event-notes', ev.notes));
  if (isEditor) {
    const acts = el('div', 'event-actions');
    const series = !!ev.repeat;
    const edit = el('button', 'link-btn', series ? 'Edit series' : 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => openEventComposer(events.find((x) => x.id === ev.id) || ev, null));
    acts.appendChild(edit);
    if (series) {
      const skip = el('button', 'link-btn', 'Skip this date');
      skip.type = 'button';
      skip.addEventListener('click', async () => {
        if (!confirm(`Leave “${ev.title}” off ${fmtDayLong(ev.date)}? The other dates stay.`)) return;
        try { await store.skipEventDate(ev.id, ev.date); } catch (_) { alert('Could not update this event.'); }
      });
      acts.appendChild(skip);
    }
    const del = el('button', 'link-btn danger', series ? 'Delete series' : 'Delete');
    del.type = 'button';
    del.addEventListener('click', async () => {
      const msg = series
        ? `Delete every date of “${ev.title}”? To drop just one date, use “Skip this date” instead.`
        : `Remove “${ev.title}” from the calendar?`;
      if (!confirm(msg)) return;
      try { await store.deleteEvent(ev.id); } catch (_) { alert('Could not delete this event.'); }
    });
    acts.appendChild(del);
    info.appendChild(acts);
  }
  row.appendChild(info);
  return row;
}

let editingEventId = null;

function openEventComposer(ev, date) {
  showError(els.eventError, '');
  els.eventForm.reset();
  editingEventId = ev ? ev.id : null;
  els.eNotifyRow.hidden = !!ev; // edits never re-notify
  if (ev) {
    els.eventFormTitle.textContent = 'Edit event';
    els.eTitle.value = ev.title || '';
    els.eDate.value = ev.date || '';
    els.eTime.value = ev.time || '';
    els.eLocation.value = ev.location || '';
    els.eNotes.value = ev.notes || '';
    els.eRepeat.value = ev.repeat || '';
    els.eUntil.value = ev.until || '';
  } else {
    els.eventFormTitle.textContent = 'Add an event';
    // Only pre-fill a day the leader actually picked on the calendar. Starting
    // on "today" made it easy to save an event on the wrong date by mistake.
    els.eDate.value = date && date > ymd(new Date()) ? date : '';
  }
  syncRepeatOptions();
  if (typeof els.eventComposer.showModal === 'function') els.eventComposer.showModal();
}

// Spell the repeat choices out for the chosen date ("Every Wednesday", …).
function syncRepeatOptions() {
  const date = els.eDate.value;
  for (const opt of els.eRepeat.options) {
    if (!opt.value) continue;
    opt.textContent = /^\d{4}-\d{2}-\d{2}$/.test(date) ? repeatLabel(opt.value, date) : opt.dataset.plain || opt.textContent;
  }
  els.eUntilRow.hidden = !els.eRepeat.value;
}
for (const opt of els.eRepeat.options) opt.dataset.plain = opt.textContent;
els.eDate.addEventListener('change', syncRepeatOptions);
els.eRepeat.addEventListener('change', syncRepeatOptions);

els.calPrev.addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
els.calNext.addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  renderCalendar();
});
els.calToday.addEventListener('click', () => {
  const d = new Date();
  calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  calSelected = ymd(d);
  renderCalendar();
});
els.newEvent.addEventListener('click', () => openEventComposer(null, calSelected));
els.eventCancel.addEventListener('click', () => els.eventComposer.close());

els.eventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = els.eTitle.value.trim();
  const date = els.eDate.value;
  if (!title) { showError(els.eventError, 'Please name the event.'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showError(els.eventError, 'Please pick a date.'); return; }
  const repeat = els.eRepeat.value;
  const until = repeat ? els.eUntil.value : '';
  if (until && until < date) { showError(els.eventError, 'The end date is before the first date.'); return; }
  const data = { title, date, time: els.eTime.value, location: els.eLocation.value, notes: els.eNotes.value, repeat, until };
  els.eventSubmit.disabled = true;
  try {
    await store.saveEvent(editingEventId, data);
    if (!editingEventId && els.eNotify.checked) notify.sendPush('new_event', sectionUrl('calendar'), { eventDate: date });
    // Jump the calendar to the saved date so it's easy to see.
    const d = parseYmd(date);
    calSelected = date;
    calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    renderCalendar();
    els.eventComposer.close();
  } catch (err) {
    showError(els.eventError, 'Could not save. ' + friendlyAuthError(err));
  } finally {
    els.eventSubmit.disabled = false;
  }
});

/* ── notifications opt-in ─────────────────────────────────────────────── */

const NOTIFY_DISMISS = 'fbcprayer_notify_dismissed';

function notifGranted() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
function notifBlocked() {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}
function updateBell() {
  if (!notify.pushConfigured) { els.notifyMenuBtn.hidden = true; return; }
  els.notifyMenuBtn.hidden = false;
  const on = notifGranted();
  els.notifyMenuBtn.classList.toggle('on', on);
  els.notifyMenuBtn.textContent = on ? '🔔 Alerts: On' : '🔔 Turn on alerts';
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

// The menu item is the always-available way to turn alerts on (the in-feed bar
// is just a one-time nudge). Works even after the bar was dismissed.
els.notifyMenuBtn.addEventListener('click', async () => {
  closeMenu();
  if (notifBlocked()) {
    alert('Notifications are blocked for this site.\n\nTo turn them on:\n• Chrome (Android): tap the ⋮ menu → Site settings → Notifications → Allow. Or tap the 🔒/ⓘ icon left of the address bar → Permissions → Notifications → Allow.\n• Then reopen the menu and tap it again.');
    return;
  }
  // Always run the enable flow, even when the browser permission is already
  // granted: permission alone doesn't mean the OneSignal push subscription is
  // opted in, and if it isn't, this device isn't actually receiving alerts.
  // promptEnable() requests permission if needed and opts the subscription in.
  const ok = await notify.promptEnable().catch(() => false);
  els.notifyBar.hidden = true;
  updateBell();
  if (ok) {
    alert('✅ Alerts are on for this device.');
  } else if (notifGranted()) {
    alert('Permission is granted, but the subscription didn’t finish registering. Please fully close and reopen the app, then try once more.');
  }
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

/* ── one-time "What's new" ─────────────────────────────────────────────── */

// Bump the suffix to show a new announcement once more to everyone.
const WHATS_NEW_KEY = 'fbcprayer_whatsnew_church_v1';

function showWhatsNew() {
  let seen = false;
  try { seen = !!localStorage.getItem(WHATS_NEW_KEY); } catch (_) {}
  if (seen || $('#whatsNewDialog').open) return;
  // Offer the alerts button only when push is set up and not already on.
  $('#whatsNewAlerts').hidden = !notify.pushConfigured || notifGranted() || notifBlocked();
  if (typeof $('#whatsNewDialog').showModal === 'function') $('#whatsNewDialog').showModal();
}

function closeWhatsNew() {
  try { localStorage.setItem(WHATS_NEW_KEY, '1'); } catch (_) {}
  $('#whatsNewDialog').close();
}

$('#whatsNewClose').addEventListener('click', closeWhatsNew);
// Esc / back button also counts as "seen".
$('#whatsNewDialog').addEventListener('cancel', () => {
  try { localStorage.setItem(WHATS_NEW_KEY, '1'); } catch (_) {}
});
$('#whatsNewAlerts').addEventListener('click', async () => {
  closeWhatsNew();
  try { await notify.promptEnable(); } catch (_) {}
  els.notifyBar.hidden = true;
  updateBell();
});

/* ── view switching ───────────────────────────────────────────────────── */

function showAuthView() {
  els.topbar.hidden = true;
  els.feedView.hidden = true;
  els.messagesView.hidden = true;
  els.calendarView.hidden = true;
  els.authView.hidden = false;
}

// Show a real, actionable error instead of hanging on "Loading…" forever.
function feedProblem(err, headline) {
  const code = (err && (err.code || err.message)) || 'timeout';
  els.feedEmpty.hidden = false;
  els.feedEmpty.innerHTML = '';
  els.feedEmpty.appendChild(el('div', 'big', '⚠️'));
  els.feedEmpty.appendChild(el('p', null, headline || 'Couldn’t load the prayer chain.'));
  let hint = 'Check your internet connection and try again.';
  if (/resource-exhausted/.test(code)) hint = 'The daily free Firebase usage limit was reached. It resets after midnight (Pacific). Try again later.';
  else if (/permission-denied/.test(code)) hint = 'Your account may have lost access. Ask a leader, or sign out and back in.';
  else if (/unavailable|network/.test(code)) hint = 'Firebase is temporarily unreachable. Please try again in a moment.';
  els.feedEmpty.appendChild(el('p', 'feed-hint', hint));
  els.feedEmpty.appendChild(el('p', 'feed-code', 'Details: ' + code));
  const btn = el('button', 'btn btn-primary', 'Retry');
  btn.addEventListener('click', () => location.reload());
  els.feedEmpty.appendChild(btn);
}

async function showFeedView() {
  const user = currentUser;
  els.authView.hidden = true;
  els.topbar.hidden = false;
  showSection(sectionFromHash());
  els.feedEmpty.hidden = false;
  els.feedEmpty.innerHTML = '<span class="big">🕊️</span>Loading the prayer chain…';
  feedLoaded = false;

  // Safety net: if nothing loads within 15s (hung SDK import, dropped
  // connection, silent listener failure), stop pretending and offer Retry.
  setTimeout(() => {
    if (!feedLoaded && currentUser === user && !els.feedView.hidden) {
      feedProblem(null, 'This is taking longer than it should.');
    }
  }, 15000);

  // Just after signup, the auth listener fires before the membership doc has
  // finished writing. Reading the profile (and thus becoming a "member") can
  // fail for a moment — wait for it to appear before attaching the live feed.
  let prof = null, lastErr = null;
  for (let i = 0; i < 8 && currentUser === user; i++) {
    try { prof = await store.getProfile(user.uid); }
    catch (e) { lastErr = e; prof = null; }
    if (prof || currentUser !== user) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (currentUser !== user) return; // signed out / changed while waiting
  if (!prof && lastErr) { feedProblem(lastErr, 'We couldn’t confirm your membership.'); return; }

  memberReady = true;
  isAdmin = !!(prof && prof.role === 'admin');
  isEditor = isAdmin || (prof && prof.role === 'pastor');
  setupNotifications(user.uid);
  showWhatsNew();
  if (section === 'calendar') { startEvents(); renderCalendar(); }
  try {
    if (!unsubPrayers) {
      unsubPrayers = await store.watchPrayers(
        (items) => {
          feedLoaded = true;
          prayers = items;
          // Auto-expand the newest request (once). If the reader collapses it,
          // it stays collapsed; a brand-new post becomes the newest and opens.
          if (items.length) {
            const newestId = items[0].id;
            if (!autoExpandedIds.has(newestId)) {
              autoExpandedIds.add(newestId);
              expandedCards.add(newestId);
            }
          }
          renderFeed();
        },
        (err) => feedProblem(err, 'Couldn’t load the prayer chain.')
      );
    }
    if (!unsubMsgs) {
      unsubMsgs = await store.watchAnnouncements(
        (items) => {
          msgsLoaded = true;
          announcements = items;
          if (section === 'messages' && !els.messagesView.hidden) markMessagesSeen();
          else updateMsgDot();
          renderMessages();
        },
        () => { msgsLoaded = true; renderMessages(); }
      );
    }
    if (!unsubMembers) {
      unsubMembers = await store.watchMembers(
        (list) => {
          members = list;
          roleByUid = {};
          // Removed members keep their doc but hold no role/access.
          for (const m of list) if (!m.removed) roleByUid[m.id] = m.role;
          // A moderator's role could change live; keep our own flag in sync.
          isAdmin = roleByUid[user.uid] === 'admin';
          isEditor = isAdmin || roleByUid[user.uid] === 'pastor';
          if (!els.listView.hidden) setListMode(!els.listEditor.hidden);
          renderFeed();
          renderMessages();
          renderCalendar();
          if (els.membersDialog.open) renderMembers();
        },
        () => {}
      );
    }
  } catch (err) {
    feedProblem(err, 'Couldn’t connect to Firebase.');
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
        if (unsubList) { unsubList(); unsubList = null; }
        if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
        if (unsubEvents) { unsubEvents(); unsubEvents = null; }
        for (const d of [els.composer, els.msgComposer, els.eventComposer]) if (d.open) d.close();
        announcements = []; msgsLoaded = false;
        events = []; eventsLoaded = false; memberReady = false;
        els.msgDot.hidden = true;
        for (const id of [...openComments.keys()]) closeComments(id);
        if (els.membersDialog.open) els.membersDialog.close();
        if (els.aboutDialog.open) els.aboutDialog.close();
        if ($('#whatsNewDialog').open) $('#whatsNewDialog').close();
        els.listView.hidden = true;
        listData = null;
        els.notifyBar.hidden = true;
        notify.pushLogout();
        prayers = [];
        members = [];
        roleByUid = {};
        isAdmin = false;
        isEditor = false;
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
