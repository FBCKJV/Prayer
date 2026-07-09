// ─────────────────────────────────────────────────────────────────────────
//  Push notification settings.  Leave both blank to keep notifications OFF
//  (the app works normally without them). Fill both in to turn them on.
//  Full walkthrough: SETUP-NOTIFICATIONS.md
// ─────────────────────────────────────────────────────────────────────────

// From OneSignal → your app → Settings → Keys & IDs → "OneSignal App ID".
export const ONESIGNAL_APP_ID = 'ce8fe217-6cba-4023-b517-56197d8f2683';

// From the OneSignal "Add Code to Site" snippet (safari_web_id). Needed for
// Apple push. Safe to leave blank if you don't have it.
export const ONESIGNAL_SAFARI_WEB_ID = 'web.onesignal.auto.3377791d-2467-4a62-9fdc-3aca1a0bc947';

// The URL of your Cloudflare Worker (cloudflare-worker/notify.js), e.g.
// 'https://prayer-notify.fbckjv.app'  or the *.workers.dev URL it gives you.
export const NOTIFY_ENDPOINT = 'https://prayer-notify.coondawg68.workers.dev';
