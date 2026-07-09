# Prayer Chain ✝

A small, **invite-only** prayer request and prayer-chain app for a church.
Built to be quiet and low-drama by design:

- **No direct messages.** There is one shared feed. Everything posted goes to
  the whole chain — nothing private between two people, so there's nothing to
  moderate in the dark.
- **Invite-only.** New members must enter a secret **invite code** to join.
  You hand the code out; you can change it any time.
- **Newest first.** The feed always scrolls newest → oldest.
- **Installable (PWA).** Members can "Add to Home Screen" and it opens like an app.

It's a plain static site (HTML/CSS/JS, no build step) backed by
**Firebase Authentication + Firestore**. It runs on Firebase's free plan.

## Features

- Email/password accounts, gated by an invite code enforced in security rules.
- Post a request with a category (Healing, Family, Salvation, …) and an optional
  **Urgent** flag.
- **🙏 "I prayed"** — tap to let someone know you're praying; shows a count.
- **Updates** — add encouragement or an update thread on any request.
- **Mark answered** — authors can flag answered prayers (and reopen or delete).
- Filter tabs: **All / Urgent / Answered / Mine**.
- Live updates across everyone's devices (Firestore realtime).
- **Open moderation.** Moderators wear a public **Moderator** badge (no hidden
  authority), can delete any post/comment, and can revoke a member from an open
  **Members** list that every member can see. Moderator status is granted only in
  the Firebase console, so it can't be self-assigned. See *"Make yourself a
  moderator"* in [SETUP.md](./SETUP.md).

## Setup

See **[SETUP.md](./SETUP.md)** for the ~15-minute, click-by-click Firebase
walkthrough. The short version:

1. Create a Firebase project, add a Web app, copy its config.
2. Enable **Email/Password** auth.
3. Create Firestore, publish the rules in [`firestore.rules`](./firestore.rules).
4. Add `config/invite` → `code` = your secret invite code.
5. Paste the config into [`js/firebase-config.js`](./js/firebase-config.js).

Until it's configured, the app shows a friendly "connect Firebase" banner.

## Project layout

```
index.html            App shell (auth + feed views, composer dialog)
css/style.css         Styles (dark theme + light-mode fallback)
js/firebase-config.js ← the ONE file you edit
js/store.js           All Firebase access (auth + Firestore)
js/app.js             UI controller
firestore.rules       Security rules (invite-only, no DMs)
manifest.json, sw.js  PWA manifest + offline app-shell service worker
```

## How invite-only stays secure

The invite code lives at `config/invite` in Firestore and is **never readable by
the app**. When someone signs up, the browser submits the code they typed as part
of creating their member document; the security rules compare it to the stored
code using `get()` server-side. A wrong code = no member document = no access to
any prayer. No Cloud Functions or paid plan required. See the comments in
[`firestore.rules`](./firestore.rules).

> Firebase web config values (apiKey, etc.) are **not** secrets — they're meant
> to be public. Your data is protected by the rules, not by hiding the config.
