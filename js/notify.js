// notify.js — web push via OneSignal (subscribe/deliver) + our Cloudflare
// Worker (send). Everything here is a safe no-op until notify-config.js is
// filled in, so the app runs fine before notifications are set up.
import { ONESIGNAL_APP_ID, NOTIFY_ENDPOINT } from './notify-config.js';
import { getIdToken } from './store.js';

export const pushConfigured = !!ONESIGNAL_APP_ID;

let osPromise = null;

// Load + init the OneSignal SDK once.
function initOneSignal() {
  if (!ONESIGNAL_APP_ID) return Promise.resolve(null);
  if (osPromise) return osPromise;
  osPromise = new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const s = document.createElement('script');
    s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    s.defer = true;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerParam: { scope: '/' },
          serviceWorkerPath: 'sw.js', // reuse our own service worker
        });
        resolve(OneSignal);
      } catch (e) {
        console.warn('[notify] OneSignal init failed', e);
        resolve(null);
      }
    });
  });
  return osPromise;
}

// Tie this browser's subscription to the signed-in member.
export async function pushLogin(uid) {
  const OneSignal = await initOneSignal();
  if (!OneSignal) return;
  try {
    await OneSignal.login(uid);
    await OneSignal.User.addTag('uid', uid);
  } catch (e) { /* ignore */ }
}

export async function pushLogout() {
  if (!osPromise) return;
  const OneSignal = await osPromise;
  if (!OneSignal) return;
  try { await OneSignal.logout(); } catch (e) { /* ignore */ }
}

// True if we should still offer an "enable notifications" prompt.
export async function pushNeedsPermission() {
  if (!ONESIGNAL_APP_ID) return false;
  const OneSignal = await initOneSignal();
  if (!OneSignal) return false;
  try {
    if (!OneSignal.Notifications.isPushSupported()) return false;
    return OneSignal.Notifications.permission !== true; // not yet granted
  } catch { return false; }
}

// Ask the browser for permission (call from a user click).
export async function promptEnable() {
  const OneSignal = await initOneSignal();
  if (!OneSignal) return false;
  try {
    await OneSignal.Notifications.requestPermission();
    return OneSignal.Notifications.permission === true;
  } catch { return false; }
}

// Ask the Worker to notify everyone. type is 'new_prayer' | 'answered'.
// The Worker builds the wording itself; we only send the token + type.
export async function sendPush(type, url) {
  if (!NOTIFY_ENDPOINT) return;
  let idToken;
  try { idToken = await getIdToken(); } catch { return; }
  if (!idToken) return;
  try {
    await fetch(NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, type, url: url || 'https://prayer.fbckjv.app' }),
      keepalive: true,
    });
  } catch (e) { /* best-effort; never block the UI */ }
}
