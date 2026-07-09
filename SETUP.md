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

## 8. Make yourself a moderator

Moderators (admins) are shown publicly with a **Moderator** badge next to their
name — oversight is out in the open, never hidden. A moderator can delete any
prayer or comment, mark any request answered, and remove a member from the
**Members** screen in the app.

You can only become a moderator from the console (never from inside the app), so
the role can't be quietly self-granted:

1. First, **join the app normally** (sign up with the invite code) so your
   `users/{uid}` document exists.
2. Firebase console → **Firestore Database → Data → `users`** collection.
3. Open your own document (match it by the `email` field).
4. Click **Add field**: name `role`, type `string`, value `admin`. **Save**.
5. Refresh the app — you'll see the **Moderator** badge and moderation controls.

Repeat for anyone else you want to make a moderator.

### Rotating / removing members

- **Change the invite code:** edit `config/invite → code` in Firestore. People
  already in keep their access; only new signups need the new code.
- **Remove someone (in the app):** open **Members** as a moderator and tap
  **Remove**. That deletes their member record, cutting off all access at once.
- **Remove someone completely:** also delete their login under
  Authentication → Users in the console.
- **Undo a moderator:** delete the `role` field on their `users/{uid}` doc.
