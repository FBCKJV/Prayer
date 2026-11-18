// Present so OneSignal's setup check finds a worker at the site root.
// The app actually runs OneSignal from its combined service worker (sw.js,
// via serviceWorkerPath in js/notify.js), which imports this same script and
// also handles offline caching. This file is a harmless fallback and is not
// the registered worker.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
