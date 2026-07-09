/**
 * FBC Prayer Chain — push notification relay (Cloudflare Worker).
 *
 * The app cannot hold the OneSignal secret key (anyone could grab it from the
 * page and spam members), so this tiny Worker holds it instead. The app POSTs
 * here with the signed-in member's Firebase ID token; the Worker verifies the
 * caller is a real member, then tells OneSignal to notify everyone.
 *
 * It never trusts client-supplied text — it builds the message itself from the
 * member's name, so prayer details never leave the app and nobody can push
 * arbitrary content.
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

    const { idToken, type, url } = body || {};
    if (!idToken) return json({ error: 'missing-token' }, 400, cors);
    if (type !== 'new_prayer' && type !== 'answered') return json({ error: 'bad-type' }, 400, cors);

    // Pull the uid out of the (still-unverified) token so we can read the caller's
    // own member document. The read itself is the real check: Firestore rejects a
    // forged/expired token (401/403) and our security rules reject non-members.
    const uid = uidFromJwt(idToken);
    if (!uid) return json({ error: 'bad-token' }, 401, cors);

    const project = env.FIREBASE_PROJECT_ID;
    const docUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${uid}`;
    const docRes = await fetch(docUrl, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!docRes.ok) return json({ error: 'not-a-member' }, 403, cors);
    const doc = await docRes.json().catch(() => ({}));
    const name = (doc.fields && doc.fields.name && doc.fields.name.stringValue) || 'A member';

    // Build the message server-side (never from the client).
    const copy = type === 'answered'
      ? { heading: '🎉 Answered prayer', content: `${name} marked a prayer answered.` }
      : { heading: '🙏 New prayer request', content: `${name} shared a prayer request. Tap to pray.` };

    const osRes = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${env.ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: env.ONESIGNAL_APP_ID,
        included_segments: ['Subscribed Users'],
        headings: { en: copy.heading },
        contents: { en: copy.content },
        url: url || 'https://prayer.fbckjv.app',
        web_push_topic: type, // collapse duplicates of the same kind
      }),
    });
    const osData = await osRes.json().catch(() => ({}));
    return json({ ok: osRes.ok, onesignal: osData }, osRes.ok ? 200 : 502, cors);
  },
};

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
