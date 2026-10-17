/**
 * FBCoPC — push notification relay (Cloudflare Worker).
 *
 * The app cannot hold the OneSignal secret key (anyone could grab it from the
 * page and spam members), so this tiny Worker holds it instead. The app POSTs
 * here with the signed-in member's Firebase ID token; the Worker verifies the
 * caller is a real member, then tells OneSignal to notify everyone.
 *
 * It never trusts client-supplied text — it builds the message itself from the
 * member's name (and, for a church message, the title read from Firestore),
 * so prayer details never leave the app and nobody can push arbitrary content.
 *
 * ── Deploy (all in the Cloudflare dashboard) ─────────────────────────────────
 *  1. Workers & Pages → Create → Worker. Name it e.g. "prayer-notify".
 *  2. Replace its code with this file's contents. Deploy.
 *  3. Settings → Variables:
 *       ONESIGNAL_APP_ID       = <your OneSignal App ID>
 *       ONESIGNAL_REST_API_KEY = <your OneSignal REST API Key>   (mark as Secret)
 *       FIREBASE_PROJECT_ID    = prayer-circle-f7a8e
 *       ALLOW_ORIGIN           = https://prayer.fbckjv.app
 *       CHURCH_TZ              = (optional) time zone for quiet hours; default America/New_York
 *  4. Give it a URL: either use the *.workers.dev URL, or add a route/custom
 *     domain like prayer-notify.fbckjv.app (Settings → Domains & Routes).
 *  5. Put that URL in the app at js/notify-config.js → NOTIFY_ENDPOINT.
 *
 * ── Birthday & anniversary greetings (optional) ──────────────────────────────
 *  Each morning at 8 AM church time the Worker posts one "🎉 Celebrating
 *  today" message for that day's birthdays/anniversaries and alerts everyone.
 *  To turn it on:
 *  a. Firebase console → ⚙ Project settings → Service accounts →
 *     "Generate new private key". A .json file downloads.
 *  b. Worker → Settings → Variables and Secrets → add a **Secret** named
 *     FIREBASE_SA and paste the WHOLE contents of that file. Deploy.
 *  c. Worker → Settings → Trigger events → add Cron Triggers
 *       0 12 * * *     and     0 13 * * *
 *     (UTC; the Worker posts only on the one that is 8 AM church time, so
 *     daylight-saving changes need no attention).
 *  Without FIREBASE_SA, a leader can still post the day's greeting from the
 *  app (Calendar → "Post today's greetings").
 */

export default {
  // Cron Triggers (see the header): post the day's birthday/anniversary greeting.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(morningGreeting(env));
  },

  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad-json' }, 400, cors); }

    const { idToken, type, url, eventDate, announcementId } = body || {};
    if (!idToken) return json({ error: 'missing-token' }, 400, cors);
    if (!COPY[type] && type !== 'celebrate') return json({ error: 'bad-type' }, 400, cors);

    // Diagnostic logging (visible in the Cloudflare Workers Logs tab). Never
    // logs secret values — only whether they are present — so it's safe to keep.
    console.log(`[notify] POST type=${type} appId=${env.ONESIGNAL_APP_ID ? 'set' : 'MISSING'} restKey=${env.ONESIGNAL_REST_API_KEY ? 'set' : 'MISSING'} project=${env.FIREBASE_PROJECT_ID || 'MISSING'}`);

    // Pull the uid out of the (still-unverified) token so we can read the caller's
    // own member document. The read itself is the real check: Firestore rejects a
    // forged/expired token (401/403) and our security rules reject non-members.
    const uid = uidFromJwt(idToken);
    if (!uid) return json({ error: 'bad-token' }, 401, cors);

    const project = env.FIREBASE_PROJECT_ID;
    const docUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${uid}`;
    const docRes = await fetch(docUrl, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!docRes.ok) {
      console.log(`[notify] membership check FAILED uid=${uid} firestoreStatus=${docRes.status}`);
      return json({ error: 'not-a-member' }, 403, cors);
    }
    const doc = await docRes.json().catch(() => ({}));
    const name = (doc.fields && doc.fields.name && doc.fields.name.stringValue) || 'A member';
    const role = (doc.fields && doc.fields.role && doc.fields.role.stringValue) || '';

    // Church messages come only from church leaders — the same people the
    // Firestore rules let post them.
    if (LEADER_ONLY.includes(type) && !LEADER_ROLES.includes(role)) {
      console.log(`[notify] leader-only type=${type} refused for uid=${uid} role=${role || 'none'}`);
      return json({ error: 'not-a-leader' }, 403, cors);
    }

    if (env.CHURCH_TZ) CHURCH_TZ = env.CHURCH_TZ;

    // A leader asking to post today's birthday/anniversary greeting now. Uses
    // the leader's own login, so Firestore rules apply as usual.
    if (type === 'celebrate') {
      const result = await postCelebrations(env, idToken, { uid, author: name, manual: true });
      return json(result, result.error ? 502 : 200, cors);
    }

    // Build the message server-side (never from client text). For a church
    // message we read the message itself from Firestore — with the caller's
    // own token — and use its title only if the caller wrote it and just
    // posted it. A calendar date is accepted only as a strict YYYY-MM-DD.
    let title = '';
    let date = typeof eventDate === 'string' ? eventDate : '';
    if (type === 'announcement' && typeof announcementId === 'string' && /^[A-Za-z0-9]{1,40}$/.test(announcementId)) {
      const annRes = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/announcements/${announcementId}`,
        { headers: { Authorization: `Bearer ${idToken}` } });
      const ann = annRes.ok ? await annRes.json().catch(() => ({})) : {};
      const f = ann.fields || {};
      const posted = f.createdAt && f.createdAt.timestampValue ? Date.parse(f.createdAt.timestampValue) : 0;
      if (f.uid && f.uid.stringValue === uid && Date.now() - posted < 10 * 60 * 1000) {
        title = ((f.title && f.title.stringValue) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        date = (f.eventDate && f.eventDate.stringValue) || '';
      } else {
        console.log(`[notify] announcement ${announcementId} not used (status=${annRes.status})`);
      }
    }
    const when = /^\d{4}-\d{2}-\d{2}$/.test(date) ? fmtDate(new Date(date + 'T12:00:00Z'), 'UTC') : '';
    const copy = COPY[type](name, when, title);

    // Only deep-link back into our own app (e.g. /#messages), never elsewhere.
    const home = env.ALLOW_ORIGIN && env.ALLOW_ORIGIN !== '*' ? env.ALLOW_ORIGIN : 'https://prayer.fbckjv.app';
    const target = typeof url === 'string' && url.startsWith(home) ? url : home;

    const notification = {
      app_id: env.ONESIGNAL_APP_ID,
      // "Total Subscriptions" is this account's default all-subscribers segment.
      // (The old OneSignal default was named "Subscribed Users", which doesn't
      // exist here — targeting it returned "All included players are not
      // subscribed" and nothing was ever sent.)
      included_segments: ['Total Subscriptions'],
      headings: { en: copy.heading },
      contents: { en: copy.content },
      url: target,
      web_push_topic: type, // collapse duplicates of the same kind
    };
    // Quiet hours: nothing buzzes phones between 8 PM and 8 AM church time.
    // Anything posted then is scheduled by OneSignal for 8 AM.
    if (env.CHURCH_TZ) CHURCH_TZ = env.CHURCH_TZ;
    const sendAt = nextAllowedTime(new Date());
    if (sendAt) notification.send_after = sendAt.toISOString();
    const { res: osRes, data: osData } = await sendOneSignal(env.ONESIGNAL_REST_API_KEY, notification);
    console.log(`[notify] OneSignal responded status=${osRes.status} scheduled=${sendAt ? sendAt.toISOString() : 'now'} body=${JSON.stringify(osData)}`);
    return json({ ok: osRes.ok, scheduledFor: sendAt ? sendAt.toISOString() : null, onesignal: osData }, osRes.ok ? 200 : 502, cors);
  },
};

// Notification wording per type, built from the sender's name only.
const COPY = {
  new_prayer: (name) => ({ heading: '🙏 New prayer request', content: `${name} shared a prayer request. Tap to pray.` }),
  answered: (name) => ({ heading: '🎉 Answered prayer', content: `${name} marked a prayer answered.` }),
  // "📣 Potluck coming up Nov 1!" / "From Pastor Dan · Sun, Nov 1 · Tap to read"
  announcement: (name, when, title) => (title
    ? { heading: `📣 ${title}`, content: `From ${name}${when ? ' · ' + when : ''} · Tap to read` }
    : {
      heading: '📣 Church message',
      content: when ? `${name} posted about an event on ${when}.` : `${name} posted a message for the church.`,
    }),
  new_event: (name, when) => ({
    heading: '📅 New on the calendar',
    content: when ? `${name} added an event on ${when}.` : `${name} added a date to the church calendar.`,
  }),
};

// "Sun, Oct 18"
function fmtDate(d, timeZone) {
  return d.toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
}
// Types only church leaders may send, and the roles that count as leaders
// (must match isEditor() in firestore.rules).
const LEADER_ONLY = ['announcement', 'new_event', 'celebrate'];
const LEADER_ROLES = ['admin', 'pastor', 'deacon', 'clerk'];

// Alerts go out only between QUIET_END and QUIET_START (church time).
// Optional Worker variable CHURCH_TZ overrides the zone.
let CHURCH_TZ = 'America/New_York';
const QUIET_START = 20; // 8 PM
const QUIET_END = 8;    // 8 AM

// null = send now; otherwise the Date of the next 8 AM in church time.
function nextAllowedTime(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  const hour = Number(p.hour);
  if (hour >= QUIET_END && hour < QUIET_START) return null;
  // Church-time offset from UTC right now (e.g. -4h in summer, -5h in winter).
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  const day = hour >= QUIET_START ? +p.day + 1 : +p.day; // evening → tomorrow morning
  const at = new Date(Date.UTC(+p.year, +p.month - 1, day, QUIET_END, 0, 0) - offset);
  // If the clocks change overnight, nudge so it still lands on 8 AM local.
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: CHURCH_TZ, hourCycle: 'h23', hour: '2-digit' }).format(at));
  return new Date(at.getTime() + (QUIET_END - h) * 3600000);
}

// OneSignal changed its auth header format: newer keys use "Key <key>", older
// REST API keys use "Basic <key>". Try the modern one first, fall back to the
// legacy one on an auth error, so either kind of key just works.
async function sendOneSignal(key, notification) {
  const url = 'https://onesignal.com/api/v1/notifications';
  const body = JSON.stringify(notification);
  let res, data;
  for (const scheme of ['Key', 'Basic']) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `${scheme} ${key}` },
      body,
    });
    data = await res.json().catch(() => ({}));
    if (res.status !== 401 && res.status !== 403) break; // auth accepted (or a non-auth error)
  }
  return { res, data };
}

function uidFromJwt(token) {
  try {
    const payload = token.split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    return decoded.user_id || decoded.sub || null;
  } catch { return null; }
}

/* ── Birthday & anniversary greetings ─────────────────────────────────────── */

const FS_BASE = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Today's date in church time → { ymd: 'YYYY-MM-DD', hour }.
function churchToday(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

// "A, B and C"
function joinNames(names) {
  return names.length <= 1 ? (names[0] || '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

// Cron entry point: only at 8 AM church time (two UTC crons cover DST).
async function morningGreeting(env) {
  if (env.CHURCH_TZ) CHURCH_TZ = env.CHURCH_TZ;
  const { hour } = churchToday(new Date());
  if (hour !== QUIET_END) return;
  if (!env.FIREBASE_SA) { console.log('[celebrate] FIREBASE_SA not set — skipping the morning greeting'); return; }
  let token;
  try { token = await serviceAccountToken(env.FIREBASE_SA); }
  catch (e) { console.log(`[celebrate] service-account login failed: ${e && e.message}`); return; }
  const r = await postCelebrations(env, token, { uid: 'church', author: env.APP_NAME || 'FBCoPC' });
  console.log(`[celebrate] cron result ${JSON.stringify(r)}`);
}

// Find today's birthdays/anniversaries (lists/celebrations plus the special
// days members added to their own profile) and, if any,
// create announcements/celebrate-YYYY-MM-DD (one per day — a second attempt
// finds it already there) and alert everyone.
async function postCelebrations(env, bearer, { uid, author, manual }) {
  const auth = { Authorization: `Bearer ${bearer}` };
  const { ymd } = churchToday(new Date());
  const md = ymd.slice(5);
  const y = +ymd.slice(0, 4);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

  const sv = (f, k) => (f && f[k] && f[k].stringValue) || '';
  const all = [];
  // 1) The leaders' list (Calendar → Add event / Import).
  const listRes = await fetch(`${FS_BASE(env)}/lists/celebrations`, { headers: auth });
  if (!listRes.ok && listRes.status !== 404) return { posted: false, error: `read-${listRes.status}` };
  if (listRes.ok) {
    const doc = await listRes.json().catch(() => ({}));
    const values = (((doc.fields || {}).entries || {}).arrayValue || {}).values || [];
    for (const v of values) {
      const f = (v.mapValue && v.mapValue.fields) || {};
      all.push({ name: sv(f, 'name').trim(), kind: sv(f, 'kind') || 'birthday', md: sv(f, 'md') });
    }
  }
  // 2) Special days members added in My profile (users/{uid}.birthday etc.).
  let pageToken = '';
  for (let page = 0; page < 20; page++) {
    const res = await fetch(`${FS_BASE(env)}/users?pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`, { headers: auth });
    if (!res.ok) { console.log(`[celebrate] reading members failed ${res.status}`); break; }
    const data = await res.json().catch(() => ({}));
    for (const d of data.documents || []) {
      const f = d.fields || {};
      if (f.removed && f.removed.booleanValue) continue;
      const name = sv(f, 'name').trim();
      if (sv(f, 'birthday')) all.push({ name, kind: 'birthday', md: sv(f, 'birthday') });
      if (sv(f, 'anniversary')) all.push({ name: sv(f, 'anniversaryName').trim() || name, kind: 'anniversary', md: sv(f, 'anniversary') });
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  // Today's, once each (someone on the list who also added themselves).
  const seen = new Set();
  const today = all.filter((c) => c.name && (c.md === md || (md === '02-28' && !leap && c.md === '02-29')))
    .filter((c) => { const k = `${c.kind}|${c.name.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (!today.length) return { posted: false, reason: 'none' };

  const birthdays = today.filter((c) => c.kind !== 'anniversary').map((c) => c.name);
  const anniversaries = today.filter((c) => c.kind === 'anniversary').map((c) => c.name);
  const lines = [
    ...birthdays.map((n) => `🎂 Happy birthday, ${n}!`),
    ...anniversaries.map((n) => `💍 Happy anniversary, ${n}!`),
    '',
    'Tap 🎉 to send your good wishes.',
  ];
  const now = new Date().toISOString();
  const str = (v) => ({ stringValue: v });
  const fields = {
    uid: str(uid), author: str(author), kind: str('celebration'),
    title: str('🎉 Celebrating today'), body: str(lines.join('\n')),
    thumbsBy: { arrayValue: {} }, createdAt: { timestampValue: now },
    eventId: str(''), eventDate: str(''), eventTime: str(''), eventLocation: str(''),
  };
  const createRes = await fetch(`${FS_BASE(env)}/announcements?documentId=celebrate-${ymd}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  if (createRes.status === 409) return { posted: false, reason: 'already' };
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => '');
    console.log(`[celebrate] create failed ${createRes.status} ${err.slice(0, 300)}`);
    return { posted: false, error: `create-${createRes.status}` };
  }

  // The alert. A greeting posted by hand after 8 PM goes up without one —
  // waking people for it (or wishing "happy birthday" the next morning) helps nobody.
  const sendAt = manual ? nextAllowedTime(new Date()) : null;
  if (sendAt && churchToday(sendAt).ymd !== ymd) return { posted: true, pushed: false, names: today.map((c) => c.name) };
  const parts = [];
  if (birthdays.length) parts.push(`Happy birthday, ${joinNames(birthdays)}!`);
  if (anniversaries.length) parts.push(`Happy anniversary, ${joinNames(anniversaries)}!`);
  let content = parts.join(' ') + ' Tap to send your wishes.';
  if (content.length > 170) content = content.slice(0, 167).trimEnd() + '…';
  const home = env.ALLOW_ORIGIN && env.ALLOW_ORIGIN !== '*' ? env.ALLOW_ORIGIN : 'https://prayer.fbckjv.app';
  const notification = {
    app_id: env.ONESIGNAL_APP_ID,
    included_segments: ['Total Subscriptions'],
    headings: { en: '🎉 Celebrating today' },
    contents: { en: content },
    url: home + '/#messages',
    web_push_topic: 'celebrate',
  };
  if (sendAt) notification.send_after = sendAt.toISOString();
  const { res } = await sendOneSignal(env.ONESIGNAL_REST_API_KEY, notification);
  return { posted: true, pushed: res.ok, names: today.map((c) => c.name) };
}

// Sign in as the Firebase service account (FIREBASE_SA secret) and get a
// short-lived access token for Firestore. Uses only the built-in WebCrypto.
async function serviceAccountToken(saJson) {
  const sa = JSON.parse(saJson);
  const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + b64url(sig),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new Error(`token ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data.access_token;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
