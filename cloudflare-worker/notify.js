/**
 * FBC Prayer Chain — push notification relay (Cloudflare Worker).
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
 *  4. Give it a URL: either use the *.workers.dev URL, or add a route/custom
 *     domain like prayer-notify.fbckjv.app (Settings → Domains & Routes).
 *  5. Put that URL in the app at js/notify-config.js → NOTIFY_ENDPOINT.
 */

export default {
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
    if (!COPY[type]) return json({ error: 'bad-type' }, 400, cors);

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
const LEADER_ONLY = ['announcement', 'new_event'];
const LEADER_ROLES = ['admin', 'pastor', 'deacon', 'secretary'];

// Alerts go out only between QUIET_END and QUIET_START (church time).
const CHURCH_TZ = 'America/New_York';
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

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
