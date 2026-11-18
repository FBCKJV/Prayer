// ─────────────────────────────────────────────────────────────────────────
//  Firebase config for this app.  ← the ONE file you must edit.
// ─────────────────────────────────────────────────────────────────────────
//  Replace the six PASTE_… values with the ones from your Firebase project's
//  Web app config (Firebase console → ⚙ Project settings → Your apps).
//  Until you do, the app shows a "connect Firebase" banner.
//
//  These values are NOT secrets — Firebase web config is meant to live in the
//  browser. Your data is protected by the security rules in firestore.rules,
//  not by hiding this. Full setup walkthrough: see CLAUDE.md or SETUP.md.
// ─────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: 'PASTE_YOUR_API_KEY',
  authDomain: 'PASTE_YOUR_PROJECT.firebaseapp.com',
  projectId: 'PASTE_YOUR_PROJECT_ID',
  storageBucket: 'PASTE_YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'PASTE_YOUR_SENDER_ID',
  appId: 'PASTE_YOUR_APP_ID'
};
