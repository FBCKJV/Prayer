// ─────────────────────────────────────────────────────────────────────────
//  Push notification settings.  Leave all three blank to keep notifications
//  OFF (the app works normally without them). Fill them in to turn them on.
//  Full walkthrough: SETUP-NOTIFICATIONS.md
// ─────────────────────────────────────────────────────────────────────────

// From OneSignal → your app → Settings → Keys & IDs → "OneSignal App ID".
export const ONESIGNAL_APP_ID = '';

// From the OneSignal "Add Code to Site" snippet (safari_web_id). Needed for
// Apple push. Safe to leave blank if you don't have it.
export const ONESIGNAL_SAFARI_WEB_ID = '';

// The URL of your Cloudflare Worker (cloudflare-worker/notify.js), e.g.
// 'https://prayer-notify.your-account.workers.dev'
export const NOTIFY_ENDPOINT = '';
