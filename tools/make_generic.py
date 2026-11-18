#!/usr/bin/env python3
"""Build the generic (church-neutral) copy of the Prayer Chain app.

The app at the top of this repo carries one church's Firebase project, push
alert settings, name, logo, address, web address and real names on the Weekly
Prayer List. Anyone else must NOT use those files as-is: their members would
sign up into that church's database. This script copies the app into generic/
with all of that replaced by blanks or placeholders, adds CLAUDE.md (the setup
guide from tools/generic-CLAUDE.md), and zips it as prayer-chain-generic.zip
for one-click download.

Run it after changing the app:   python3 tools/make_generic.py

It stops with an error if anything church-specific would end up in the copy.
"""
import hashlib
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
OUT = ROOT / "generic"
ZIP = ROOT / "prayer-chain-generic.zip"
ZIP_FOLDER = "prayer-chain"

# Tracked files that never go in the generic copy.
SKIP_FILES = {"CNAME", "FBC Logo transparent.png", "README.md", ZIP.name}
SKIP_DIRS = ("docs/", "tools/", "generic/")

TEXT_EXT = {".html", ".js", ".json", ".css", ".md", ".rules", ".svg", ".txt"}

# Church-specific wording → placeholders (longest first).
REPLACE = [
    ("Faith Baptist Church of Plymouth County", "Your Church Name"),
    ("190 Center Street, Carver, MA", "Church address, City, State"),
    ("FBC Prayer Chain", "Prayer Chain"),
    ("FBCoPC", "Prayer Chain"),
    ("prayer-notify.coondawg68.workers.dev", "prayer-notify.your-account.workers.dev"),
    ("prayer-notify.fbckjv.app", "prayer-notify.yourchurch.org"),
    ("prayer.fbckjv.app", "prayer.yourchurch.org"),
    ("prayer-circle-f7a8e", "your-project-id"),
    ("sign in (you already use OneSignal)", "sign in (a free account is fine)"),
    ("8 AM in Massachusetts", "8 AM church time"),
]

# Patterns that must not survive anywhere in the generic copy.
FORBIDDEN = [
    r"AIza[0-9A-Za-z_-]{20,}",          # a real Firebase API key
    r"prayer-circle", r"fbckjv", r"coondawg",
    r"Faith Baptist", r"Plymouth", r"Carver", r"FBCoPC", r"\bFBC\b",
    r"117668389168",                    # Firebase sender id
    r"ce8fe217", r"3377791d",           # OneSignal ids
]

BLANK_FIREBASE = """// ─────────────────────────────────────────────────────────────────────────
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
"""

BLANK_NOTIFY = """// ─────────────────────────────────────────────────────────────────────────
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
"""

# Example Weekly Prayer List (no real people). Sections not listed start empty.
GENERIC_SEED = {
    "Government": [
        "Our President and national leaders",
        "Our governor and state leaders",
        "Local leaders, police, firefighters & first responders",
    ],
    "Church": [
        "Our pastor and family",
        "Church leaders and teachers",
        "Visitors and new members",
    ],
}


def die(msg):
    sys.exit(f"make_generic: {msg}")


def tracked_files():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    for name in out.splitlines():
        if name in SKIP_FILES or name.startswith(SKIP_DIRS):
            continue
        yield name


def generic_seed(real_text):
    m = re.search(r"export const LIST_SECTIONS = \[(.*?)\];", real_text, re.S)
    if not m:
        die("could not find LIST_SECTIONS in js/prayer-list-seed.js; update tools/make_generic.py")
    sections = re.findall(r"'([^']+)'", m.group(1))
    unknown = set(GENERIC_SEED) - set(sections)
    if unknown:
        die(f"GENERIC_SEED has sections the app doesn't: {sorted(unknown)}")
    lines = [
        "// Starting content for the standing Weekly Prayer List. This is what everyone",
        "// sees until a church leader edits + saves it in the app (📋 Prayer List →",
        "// Edit), which stores it in Firestore at lists/weekly and takes over from",
        "// this seed. Each section is one item per line.",
        "",
        "export const LIST_SECTIONS = [",
        *[f"  '{s}'," for s in sections],
        "];",
        "",
        "export const LIST_SEED = {",
    ]
    for s in sections:
        items = GENERIC_SEED.get(s)
        if items:
            lines.append(f"  '{s}': [")
            lines += [f"    {repr(i)}," for i in items]
            lines.append("  ].join('\\n'),")
        else:
            lines.append(f"  '{s}': '',")
    lines += ["};", ""]
    return "\n".join(lines), sections


def real_seed_entries(real_text):
    """Every person/line on the real list, so we can prove none leak."""
    body = real_text.split("export const LIST_SEED", 1)[-1]
    return {s for s in re.findall(r'"([^"]{4,})"', body)}


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()

    for name in tracked_files():
        src, dst = ROOT / name, OUT / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix in TEXT_EXT and "vendor/" not in name:
            text = src.read_text(encoding="utf-8")
            for old, new in REPLACE:
                text = text.replace(old, new)
            dst.write_text(text, encoding="utf-8")
        else:
            shutil.copy2(src, dst)

    # Settings files: blank.
    (OUT / "js/firebase-config.js").write_text(BLANK_FIREBASE, encoding="utf-8")
    (OUT / "js/notify-config.js").write_text(BLANK_NOTIFY, encoding="utf-8")

    # notify.js falls back to the live site's address; use wherever the app is.
    nj = OUT / "js/notify.js"
    t = nj.read_text(encoding="utf-8")
    t2 = t.replace("url || 'https://prayer.yourchurch.org'", "url || location.href.split('#')[0]")
    if t2 == t:
        die("could not find the fallback URL in js/notify.js; update tools/make_generic.py")
    nj.write_text(t2, encoding="utf-8")

    # Weekly Prayer List: example entries only.
    real_seed = (ROOT / "js/prayer-list-seed.js").read_text(encoding="utf-8")
    seed_js, _ = generic_seed(real_seed)
    (OUT / "js/prayer-list-seed.js").write_text(seed_js, encoding="utf-8")

    # Logo, icons and QR code: generic ones from tools/generic-assets/.
    for f in (TOOLS / "generic-assets").iterdir():
        dst = OUT / ("assets" if f.name in ("logo-display.png", "qr.svg") else "assets/icons") / f.name
        if not dst.exists():
            die(f"{dst.relative_to(OUT)} isn't in the app any more; update tools/generic-assets/")
        shutil.copy2(f, dst)

    # Setup guide a church hands to Claude (Claude Code reads CLAUDE.md automatically).
    shutil.copy2(TOOLS / "generic-CLAUDE.md", OUT / "CLAUDE.md")

    # ── Safety checks ──────────────────────────────────────────────────────
    leaks = real_seed_entries(real_seed)
    for f in OUT.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(OUT)
        if f.suffix in TEXT_EXT and "vendor" not in rel.parts:
            text = f.read_text(encoding="utf-8")
            for pat in FORBIDDEN:
                m = re.search(pat, text)
                if m:
                    die(f"{rel} still contains church-specific text: {m.group(0)!r}")
            for entry in leaks:
                if entry in text:
                    die(f"{rel} still contains a Weekly Prayer List entry: {entry!r}")
        elif f.suffix == ".png":
            orig = ROOT / rel
            if orig.exists() and hashlib.sha256(orig.read_bytes()).digest() == hashlib.sha256(f.read_bytes()).digest():
                die(f"{rel} is still the church's own image; add a generic one to tools/generic-assets/")

    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(OUT.rglob("*")):
            if f.is_file():
                z.write(f, f"{ZIP_FOLDER}/{f.relative_to(OUT).as_posix()}")
    print(f"Wrote {OUT.relative_to(ROOT)}/ and {ZIP.name}")


if __name__ == "__main__":
    main()
