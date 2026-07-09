// ─────────────────────────────────────────────────────────────────────────
//  PASTE YOUR FIREBASE CONFIG HERE
// ─────────────────────────────────────────────────────────────────────────
//  1. Go to  https://console.firebase.google.com  and create a project.
//  2. Add a "Web app" (</> icon). Firebase shows you a firebaseConfig object.
//  3. Copy those values into the object below (replace the PASTE_… lines).
//  4. In the console: Build → Authentication → enable "Email/Password".
//  5. Build → Firestore Database → create database (Production mode), then
//     paste the rules from firestore.rules (see SETUP.md for the click path).
//  6. Add a document at collection "config", document id "invite",
//     field:  code  (string) = your secret invite code.
//
//  Full walkthrough with screenshots-worth-of-detail: see SETUP.md
// ─────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT.firebaseapp.com',
  projectId: 'PASTE_PROJECT',
  storageBucket: 'PASTE_PROJECT.appspot.com',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID'
};
