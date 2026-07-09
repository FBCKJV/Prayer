# Setup guide — Prayer Chain

You only do this once. Plan on ~15 minutes. No coding required — just clicking
in the Firebase console and pasting a few values into one file.

Everything runs on Firebase's **free (Spark) plan**. No billing/credit card is
needed for what this app does.

---

## 1. Create a Firebase project

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
2. Click **Add project** (or **Create a project**).
3. Name it something like `church-prayer`. Click through — you can **turn OFF
   Google Analytics**, it isn't needed. Click **Create project**.

## 2. Register a Web app and copy the config

1. On the project home, click the **`</>`** (Web) icon — "Add app".
2. Give it a nickname like `Prayer Chain`. You do **not** need Firebase Hosting.
   Click **Register app**.
3. Firebase shows a `const firebaseConfig = { … }` block. Keep this tab open —
   you'll copy these six values in step 5.

## 3. Turn on Email/Password sign-in

1. Left sidebar → **Build → Authentication → Get started**.
2. Under **Sign-in method**, click **Email/Password**, toggle **Enable**, **Save**.

## 4. Create the Firestore database + rules

1. Left sidebar → **Build → Firestore Database → Create database**.
2. Choose a location close to your church, pick **Start in production mode**,
   click **Create**.
3. Open the **Rules** tab. Delete what's there, paste the entire contents of
   [`firestore.rules`](./firestore.rules) from this project, and click **Publish**.

## 5. Set the invite code

1. Still in Firestore, open the **Data** tab → **Start collection**.
2. Collection ID: `config` → **Next**.
3. Document ID: type exactly `invite`.
4. Add a field: name `code`, type `string`, value = your secret code
   (e.g. `Grace2026`). Click **Save**.

> To change the invite code later, just edit this `code` value. Anyone who
> already has an account keeps their access — the code only gates **new** signups.

## 6. Paste the config into the app

1. Open [`js/firebase-config.js`](./js/firebase-config.js).
2. Replace the six `PASTE_…` values with the ones from step 2.
   It should end up looking like:

   ```js
   export const firebaseConfig = {
     apiKey: 'AIza…',
     authDomain: 'church-prayer.firebaseapp.com',
     projectId: 'church-prayer',
     storageBucket: 'church-prayer.appspot.com',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abcdef…'
   };
   ```
3. Save, commit, and push. That's it.

> These values are **not secrets** — Firebase web config is meant to live in the
> browser. Your data is protected by the rules from step 4, not by hiding these.

## 7. Invite people

Share two things with your church members:

- the app link, and
- the **invite code**.

They tap **Join**, enter their name, email, a password, and the code. Done.
No one can read a single prayer without an account, and there are **no DMs** —
every post goes to the whole chain.

---

### Optional: put it online with GitHub Pages

If this lives in its own repo:

1. Repo **Settings → Pages**.
2. **Source:** *Deploy from a branch*, **Branch:** `main` / root, **Save**.
3. After a minute your app is at `https://<user>.github.io/<repo>/`.
4. (Optional) add a custom domain like `prayer.yourchurch.org` in that same Pages
   screen, then point a CNAME DNS record at it.

### Rotating / removing members

- **Change the invite code:** edit `config/invite → code` in Firestore.
- **Remove someone:** Authentication → Users → delete their account, and delete
  their `users/{uid}` doc in Firestore. They lose all access immediately.
- **Make yourself able to delete any post:** the rules already let a request's
  author delete it and delete comments on it. For broad moderation you can always
  delete anything directly in the Firestore console.
