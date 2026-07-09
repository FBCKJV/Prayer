# Setup guide — Push notifications

This turns on alerts for **new prayer requests** and **answered prayers**.
Comments never trigger notifications. Everything is free (OneSignal free tier +
Cloudflare Workers free tier) — no credit card.

There are three parts: **OneSignal** (delivers the alert), a **Cloudflare
Worker** (safely sends it), and pasting two values into the app. Plan ~20 min.

> Until you finish this, the app works exactly as before — notifications are
> simply off. So there's no rush and nothing breaks midway.

---

## Part A — OneSignal (the delivery service)

1. Go to **https://onesignal.com** and sign in (you already use OneSignal).
2. **New App/Website**. Name it `FBC Prayer Chain`. Platform: **Web**. Click
   **Next: Configure Your Platform**.
3. Integration: choose **Typical Site**. Fill in:
   - **Site Name:** FBC Prayer Chain
   - **Site URL:** `https://prayer.fbckjv.app`
   - **Auto Resubscribe:** ON
   - **Default Icon:** upload the church logo if you like (optional).
4. Expand **Advanced → Service Workers** and turn on **Customize service worker
   paths**. Set:
   - **Path to service worker files:** *(leave blank / root)*
   - **Main Service Worker Filename:** `sw.js`
   - **Registration Scope:** `/`

   (This makes OneSignal reuse the app's own service worker, so there's no extra
   file to upload.)
5. **Save**. OneSignal may show install code — you can ignore it; the app
   already includes everything.
6. Get your two values (top-left **gear / Settings → Keys & IDs**):
   - **OneSignal App ID** — you'll paste this into the app (Part C).
   - **REST API Key** — you'll paste this into the Worker (Part B). Keep it
     private; it goes in the Worker only, never in the app.

## Part B — Cloudflare Worker (the secure sender)

1. Cloudflare dashboard → **Workers & Pages → Create → Create Worker**.
2. Name it `prayer-notify` → **Deploy** (accept the starter code for now).
3. Click **Edit code**. Delete everything and paste the full contents of
   [`cloudflare-worker/notify.js`](./cloudflare-worker/notify.js) from this repo.
   **Deploy**.
4. Open the Worker's **Settings → Variables and Secrets** and add four:
   | Name | Type | Value |
   |------|------|-------|
   | `ONESIGNAL_APP_ID` | Text | your OneSignal App ID (Part A) |
   | `ONESIGNAL_REST_API_KEY` | **Secret** | your OneSignal REST API Key (Part A) |
   | `FIREBASE_PROJECT_ID` | Text | `prayer-circle-f7a8e` |
   | `ALLOW_ORIGIN` | Text | `https://prayer.fbckjv.app` |

   **Deploy / Save** so the variables take effect.
5. Give the Worker a web address. Easiest: **Settings → Domains & Routes → Add →
   Custom Domain** and enter `prayer-notify.fbckjv.app` (Cloudflare creates the
   DNS for you since it runs your domain). Or just use the `*.workers.dev` URL it
   already shows. Copy whichever URL you'll use.

## Part C — Point the app at them

Open [`js/notify-config.js`](./js/notify-config.js) and fill in the two values:

```js
export const ONESIGNAL_APP_ID = 'paste-your-onesignal-app-id';
export const NOTIFY_ENDPOINT  = 'https://prayer-notify.fbckjv.app'; // your Worker URL
```

Save, commit, and push. (Or just send me both values and I'll do it.)

---

## Testing it

1. On a phone, open **https://prayer.fbckjv.app** and sign in. A **"Turn on
   prayer alerts"** bar appears — tap **Allow** and accept the browser prompt.
2. From a *different* account or device, post a prayer request.
3. The first phone should get a **"🙏 New prayer request"** notification.
4. Mark a request answered → members get a **"🎉 Answered prayer"** alert.

### iPhone / iPad note

Apple only allows web-push for **installed** web apps. So on an iPhone, a member
must first **Add to Home Screen** (Share → Add to Home Screen), **open the app
from that icon**, and *then* tap Allow. In a regular Safari tab, the alerts bar
won't be able to enable notifications — that's an Apple limitation, not a bug.

## Notes

- Notifications say *who* posted, never the prayer's text — sensitive details
  never appear on a lock screen. The Worker composes the wording itself, so no
  one can push custom messages.
- Only signed-in members can trigger a notification; the Worker verifies each
  sender against your Firestore rules before sending.
- To pause notifications entirely, blank out both values in `notify-config.js`
  and push. To stop for one person, they can turn off notifications for the site
  in their phone/browser settings.
