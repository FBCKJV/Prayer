# Prayer Chain — Setup Guide for Claude

> **For the person reading this:** give this file to Claude and ask for help setting up Prayer Chain.
> - **Claude Code:** open this folder in Claude Code and say "help me set this up". Claude reads this file automatically.
> - **claude.ai (or the Claude app):** start a new chat, attach this file, and say "help me set this up".
>
> Plan on about 30 minutes for the basics. You'll need a Google account (for Firebase) and a free GitHub account (to put the app online). Push alerts are an optional extra (another 20 minutes) you can add later.

---

## Instructions for Claude

You're helping a church volunteer set up **Prayer Chain**, a free, invite-only app where a church family shares prayer requests and praise, reads messages from the pastor and leaders, and sees the church calendar. Assume the person is not technical. Your job is to get them from this folder of files to a working app their church can open on their phones.

### How to guide them

- **One step at a time.** Give one small step, then wait for them to say it's done (or send a screenshot) before going on. Never paste the whole guide at once.
- **Say exactly where to click.** Use the button and menu names they'll see on screen. If what they see doesn't match (websites change), ask for a screenshot and adapt.
- **Plain words.** Say "database", not "Firestore", once you've explained it. Explain a term once if you need it.
- **Check as you go.** At the end of each part, confirm it worked before moving on.
- **Edit only what this guide says to edit.** Change only the settings and wording listed below. Leave the rest of the code alone.
- **Their Firebase settings aren't secret passwords**, but they are specific to their church. They can paste them to you. The **OneSignal REST API Key** and the **Firebase service-account file** (both only in the optional alerts part) *are* secrets: they go into Cloudflare only, never into the app's files and never into a chat if they can avoid it.

### Can you edit the files directly?

- **If you have file tools (Claude Code):** make the edits yourself, then show them what changed.
- **If you're in a chat without file access:** have them put the files on GitHub first (Part 7), then edit there with the GitHub website editor. Give exact "find this text, replace it with this" instructions, and tell them to use the editor's search (Ctrl+F, or ⌘F on a Mac). The files are small enough that they can paste one to you if that's easier.

### Gather this first

Ask for these near the start (they can change them later):

1. **Church name**, exactly as it should appear.
2. **Church address** (street, city, state). It's shown at the bottom of the About screen.
3. **The church's logo**, if they have one (a square PNG works best). Optional: a plain blue cross is built in.
4. **An invite code**: a word or phrase members will type to join, e.g. `Grace2026`. Anyone with the code can join, so it's shared only with church members.
5. **Who the leaders are**: who should be a **Moderator**, who is the **Pastor**, and any **Deacons** or **Clerk**. (Part 9 explains what each can do.)

---

## Part 1 — Create a Firebase project

Firebase is Google's free service that holds the accounts and the prayers and keeps every phone in sync.

1. Go to **https://console.firebase.google.com** and sign in with a Google account. A church account is better than a personal one, so the project outlives any one volunteer.
2. Click **Create a project** (or **Add project**). Name it after the church, e.g. `grace-bible-prayer`.
3. When asked about **Google Analytics**, turn it off. It isn't needed.
4. Wait for "Your project is ready", then click **Continue**.

**Cost:** the free "Spark" plan is plenty. Firebase doesn't ask for a credit card on this plan. If it ever asks them to upgrade or add billing, stop and tell them they don't need to.

## Part 2 — Turn on email sign-in

Members sign in with their email address and a password they choose.

1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → click **Email/Password** → switch the first toggle **on** → **Save**.

## Part 3 — Create the database and its rules

1. Left menu: **Build → Firestore Database → Create database**. (Make sure it's **Firestore**, not "Realtime Database".)
2. Pick the location closest to them (e.g. United States), choose **Start in production mode**, and click **Create**.
3. Open the **Rules** tab. Delete everything in the box, paste the **entire** contents of `firestore.rules` from this folder, and click **Publish**.
   - In Claude Code, read `firestore.rules` and give it to them to paste. In a chat, have them open the file on GitHub (Part 7) or in Notepad/TextEdit and copy all of it.

These rules are what keep the app private: nobody can read anything without an account, and an account only works with the invite code.

## Part 4 — Set the invite code

1. Still in **Firestore Database**, open the **Data** tab and click **Start collection**.
2. Collection ID: `config` → **Next**.
3. Document ID: type exactly `invite`.
4. Add a field: name `code`, type **string**, value = their invite code. Click **Save**.

To change the code later they just edit this value. People already in keep their access; the code only matters for new members joining.

## Part 5 — Register the web app and get the settings

1. Click the **gear icon ⚙️** (next to "Project Overview") → **Project settings**.
2. Scroll to **Your apps** and click the **web icon `</>`**.
3. App nickname: `prayer-chain-web`. Leave "Firebase Hosting" unchecked. Click **Register app**.
4. A code box appears with a `firebaseConfig` that looks like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "grace-bible-prayer.firebaseapp.com",
  projectId: "grace-bible-prayer",
  storageBucket: "grace-bible-prayer.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123..."
};
```

5. Have them copy that block and paste it to you. You need all six values.

## Part 6 — Put their settings and church details into the app

### 6a. Firebase settings — `js/firebase-config.js`

Replace each `PASTE_…` value with theirs, keeping the quotes:

```js
export const firebaseConfig = {
  apiKey: 'AIzaSy...',
  authDomain: 'grace-bible-prayer.firebaseapp.com',
  projectId: 'grace-bible-prayer',
  storageBucket: 'grace-bible-prayer.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123...'
};
```

Until this is filled in, the app shows an "Almost there… isn't connected to Firebase yet" banner. That's expected.

### 6b. Church name and address — `index.html` and `manifest.json`

Replace every occurrence of these placeholders (use search; there are several in `index.html`):

| Find | Replace with |
|---|---|
| `Your Church Name` | the church's name (in `index.html` and `manifest.json`) |
| `Church address, City, State` | the church's address (bottom of the About screen, `index.html`) |
| `prayer.yourchurch.org` | the app's web address, once they have it from Part 7 (About screen, `index.html`) |

The app itself is called **Prayer Chain**. If they'd like another name (e.g. "Grace Prayer"), replace `Prayer Chain` in `index.html`, `manifest.json` and `js/app.js` (it's used in a few messages and the Prayer List PDF's file name). Keep it short: it shows under the icon on phones.

### 6c. Logo and icons (optional) — `assets/`

The built-in logo is a blue circle with a white cross. To use the church's own logo, replace these files, keeping the **same names and sizes**:

| File | Size | Notes |
|---|---|---|
| `assets/logo-display.png` | 256×256 | Shown at the top of the app, sign-in screen and PDF. Transparent background looks best. |
| `assets/icons/icon-192.png`, `icon-512.png` | 192×192, 512×512 | Transparent background is fine. |
| `assets/icons/favicon-32.png` | 32×32 | Browser tab icon. |
| `assets/icons/app-icon-192.png`, `app-icon-512.png` | 192×192, 512×512 | Home-screen icon. Solid background, logo kept inside the middle 80% (phones crop the corners). |
| `assets/icons/apple-touch-icon.png` | 180×180 | iPhone home-screen icon. Solid background. |
| `assets/icons/icon-maskable-512.png` | 512×512 | Solid background, logo inside the middle 80%. |

In Claude Code you can make all of these from one logo file (Python with Pillow works well). In a chat, suggest a free icon resizer site, or simply keep the built-in cross.

### 6d. QR code (after Part 7)

The About screen shows `assets/qr.svg`, a QR code people can scan to open the app. The download has a placeholder. Once they know the app's web address, make a QR code for it and save it as `assets/qr.svg`:
- In Claude Code: e.g. `npx qrcode -t svg -o assets/qr.svg "https://their-address/"` (or Python's `qrcode` package).
- In a chat: any free QR code generator that downloads **SVG**; rename the file to `qr.svg` and upload it into the `assets` folder on GitHub, replacing the old one.

### 6e. Weekly Prayer List starting content (optional)

`js/prayer-list-seed.js` holds a few example lines (Government, Church). It's only the starting point: once the app is running, a leader taps **📋 Prayer List → Edit** and types the real list in the app. Most people should just do that.

## Part 7 — Put the app online (GitHub Pages, free)

Phones need the app at a secure web address (`https://…`) to install it and get alerts.

1. Sign in at **https://github.com** (free account).
2. Click **+** (top right) → **New repository**. Name it **exactly** `their-username.github.io` (their GitHub username, then `.github.io`; e.g. `gracebible.github.io`). Choose **Public** (free GitHub Pages needs a public repository). Click **Create repository**.
   - **Why that name:** it puts the app at the top of the address (`https://gracebible.github.io/`), not in a sub-folder. Push alerts (Part 11) only work when the app is at the top of its address. If the church will use its own domain (see "Custom address" below), any repository name is fine.
   - A GitHub account can have only one repository with that name. If theirs is already taken, use a custom address or make a new GitHub account for the church.
3. On the new page, click **uploading an existing file**. Open this folder on their computer, select **everything inside it** (all files *and* the `assets`, `css`, `js` and `cloudflare-worker` folders) and drag it all into the page. Check that the folders came through, then click **Commit changes**.
   - Some computers hide files starting with a dot. `.nojekyll` should be uploaded too; if it's missing, create it on GitHub with **Add file → Create new file**, name `.nojekyll`, leave it empty, and commit.
4. Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** and the folder to **/ (root)**, then **Save**.
5. After a minute or two the page shows the address, like `https://their-username.github.io/`. Now do Part 6d (QR code) and the `prayer.yourchurch.org` replacement in 6b with this address.

**If you're in a chat and they're editing on GitHub:** open a file, click the **pencil ✏️** (Edit), use Ctrl+F to find each spot, make the change, then **Commit changes**. The live site updates within a couple of minutes.

**Custom address (optional):** if the church owns a domain, they can use something like `prayer.theirchurch.org` under **Settings → Pages → Custom domain**, plus a CNAME record at their domain provider pointing to `their-username.github.io`. A sub-domain like this also puts the app at the top of its address, so alerts work.

**Public repository note:** their Firebase settings will be visible in the code. That's normal for Firebase web apps, since the rules from Part 3 are what keep strangers out. No prayers or member details are ever in the code. Mention it so it's not a surprise.

## Part 8 — Test it and join

1. Open the address on their phone. They should see the sign-in screen with their church name.
2. Tap **Join**, enter their name, email, a password and the **invite code**, and tap the button.
   - ✅ Expected: the **Prayers & Praise** tab opens.
3. Tap **＋ Share a prayer request**, type a test request and post it.
4. Open the same address on a **second phone or a computer**, join with a second email, and check the test request appears and **🙏 I prayed** works.
5. Delete the test request (open it, then **Delete**).

### If something's wrong

| What they see | Likely cause | Fix |
|---|---|---|
| "Almost there… isn't connected to Firebase yet" | `js/firebase-config.js` still has `PASTE_…` values | Part 6a |
| "Could not reach Firebase" | A setting is mistyped | Re-check Part 6a against Part 5, character by character |
| "That invite code is not valid" | Code mismatch, or the `config/invite` document is misnamed | Part 4. It must be collection `config`, document `invite`, field `code` (all lowercase), and the code is case-sensitive |
| Every sign-up fails, even with the right code | Email/Password sign-in is off | Part 2 |
| "Couldn't load prayers & praise" … "Your account may have lost access" | Rules not published, or the old default rules are still there | Part 3, step 3 |
| Old version still showing after an edit | Phone cached the app | Wait a couple of minutes, then close and reopen the app (or reload twice) |

## Part 9 — Make the leaders

Leaders get a public badge next to their name (nothing is hidden), and their powers can only be granted in the Firebase console, never from inside the app.

| Role | Badge | Can do |
|---|---|---|
| `admin` | Moderator | Everything leaders can, plus delete anyone's post or comment and remove/restore members |
| `pastor` | Pastor | Post church **Messages**, add **Calendar** dates and birthdays, edit the **Weekly Prayer List** |
| `deacon` | Deacon | Same as pastor |
| `clerk` | Clerk | Same as pastor |

For each leader (start with the person you're helping, as `admin`):

1. The leader **joins the app normally** first (Part 8), so their member record exists.
2. Firebase console → **Firestore Database → Data → `users`**.
3. Open their document (match it by the `email` field).
4. **Add field**: name `role`, type **string**, value `admin`, `pastor`, `deacon` or `clerk`. **Save**.
5. They refresh the app and see their badge and the extra buttons.

To take a role away, delete the `role` field.

## Part 10 — Hand it to the church

Give them a short message to send to members, filled in with their address and invite code:

> Our church has a private prayer app! Open **https://their-username.github.io/** on your phone.
> Tap **Join**, enter your name, email, a password, and our invite code: **Grace2026**.
> - **iPhone:** in Safari, tap Share → **Add to Home Screen**, then open it from the new icon.
> - **Android:** in Chrome, tap ⋮ → **Install app** (or Add to Home screen).
>
> Share requests and praise, tap 🙏 when you pray for someone, and check 📣 Messages and 📅 Calendar for church news. Everything is shared with the whole church family; there are no private messages.

Then point out to the leaders:
- **📋 Prayer List → Edit** to type the weekly list; **📄 Download PDF** makes the printable two-per-page sheet.
- **📅 Calendar → ＋ Add event** for services and events (they can repeat weekly or monthly) and for **birthdays and anniversaries**. Many at once: **Import** a spreadsheet saved as CSV with columns *Name, Type, Date*.
- **⋯ → 👥 Members** shows everyone who has joined; moderators can remove someone there.
- **Changing the invite code** (Part 4) stops new people joining with the old one; current members aren't affected.
- **⋯ → ❓ How do I…?** answers common member questions in plain words.

## Part 11 (optional) — Push alerts

Alerts tell members when there's a new prayer request, an answered prayer, or a church message, and can post a 🎉 birthday/anniversary greeting each morning. They're off until set up, and the app works fully without them.

Ask whether they'd like alerts now or later. If now, walk them through **`SETUP-NOTIFICATIONS.md`** in this folder, one step at a time, in the same way. It uses two more free services (OneSignal and a Cloudflare Worker). Notes for you:
- **First check the address:** alerts need the app at the top of its address (`https://their-username.github.io/` or a custom domain), not in a sub-folder like `…github.io/prayer/`. If it's in a sub-folder, move it first (Part 7).
- Wherever that guide shows `your-project-id`, use their Firebase **projectId**; wherever it shows `prayer.yourchurch.org`, use their app's address (for `ALLOW_ORIGIN`, just `https://` plus the host with no slash at the end, e.g. `https://their-username.github.io`).
- If they aren't in the US Eastern time zone, add a Worker variable `CHURCH_TZ` with their time zone (e.g. `America/Chicago`), so quiet hours (8 PM–8 AM) and the morning greeting use their local time.
- At the end, the OneSignal App ID, Safari Web ID and Worker URL go into `js/notify-config.js`. The **REST API Key** and the **service-account file** stay in Cloudflare only.

---

## Reference: what's in this folder

| File | What it is | Edit it? |
|---|---|---|
| `index.html` | The app's screens | Only the wording in Part 6b |
| `manifest.json` | Lets phones install it like an app | Only the name in Part 6b |
| `js/firebase-config.js` | Their Firebase settings | **Yes**, Part 6a |
| `js/notify-config.js` | Alert settings | Only in Part 11 |
| `js/prayer-list-seed.js` | Starting Weekly Prayer List | Optional, Part 6e |
| `js/app.js`, `js/store.js`, `js/notify.js` | How the app works | No (except renaming the app, 6b) |
| `css/style.css` | Colors and layout | No |
| `assets/` | Logo, icons, QR code | Optional, Parts 6c and 6d |
| `firestore.rules` | Database security rules | No: paste into Firebase as-is (Part 3) |
| `cloudflare-worker/notify.js` | The alert sender | No: paste into Cloudflare as-is (Part 11) |
| `sw.js`, `OneSignalSDKWorker.js` | Offline support and alerts | No |
| `SETUP.md`, `SETUP-NOTIFICATIONS.md` | The same steps for people doing it by hand | No |
| `CLAUDE.md` | This guide | No |
