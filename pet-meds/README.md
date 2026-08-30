# PetMed PWA

A beginner-friendly pet medicine tracker that runs in a browser and can be installed on supported iPhone, iPad, and Android devices.

## Simple first-time flow

1. Add your pet — only the pet name and type are needed.
2. Add a medicine — medicine name, amount, schedule, and time are the main fields.
3. Open **Today** and tap **Mark as given** after each dose.

Extra pet health, medicine, refill, pharmacy, and veterinary details are hidden under optional sections so new users are not overwhelmed.

## Included

- Multiple pet profiles
- Daily, selected-day, every-few-days, one-time, and as-needed medicines
- Up to three easy-to-enter dose times per medicine
- Today screen with clear pet, medicine, amount, time, and status
- Given, late, missed, and skipped dose history
- Optional medicine and pet photos
- Multiple people/caregivers on the same device
- Optional refill counts and health details
- Backup and restore from the **More** screen
- Offline PWA support
- Installable manifest and app icons
- All user-entered data stored in browser `localStorage`

## Run locally

From this folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

`localhost` is allowed for service-worker development. A deployed PWA should use HTTPS.

## Install on a phone

### iPhone / iPad

Open the deployed HTTPS site in Safari, tap **Share**, then **Add to Home Screen**.

### Android

Open the deployed HTTPS site in Chrome or another supporting browser and choose **Install app** or **Add to Home screen**.

## Reminder limitation

This version intentionally has no server and no cloud account. Browser notifications can work while the PWA is active, but iOS and Android may suspend a fully closed browser/PWA. Reliable background alarms after the app is closed require Web Push infrastructure or a native notification layer.

## Data and privacy

Pet, medicine, dose-history, caregiver, settings, photos, and reminder-marker data stay in browser `localStorage` on the current device/browser profile. Clearing site data can erase it, so the app includes a backup option under **More → Back up my data**.

## Search privacy / discoverability

This build is configured to discourage public search-engine indexing:

- `robots.txt` blocks crawlers from the entire site.
- HTML includes `noindex`, `nofollow`, `noarchive`, `nosnippet`, and `noimageindex`.
- `_headers` adds an `X-Robots-Tag` for hosts that support Netlify/Cloudflare Pages-style headers.
- `vercel.json` adds the same `X-Robots-Tag` when deployed on Vercel.
- Referrer headers are restricted on supported hosts.

These controls make the deployed PWA difficult to discover through normal search engines, but they are **not access control**. Anyone who knows the public URL can still open the app. A public Git repository can also be indexed separately from the deployed app. Use a private Git repository if you do not want the source repository to be publicly discoverable.

If a previous deployment was already indexed, search engines can take time to remove it after seeing the new `noindex` directives.
