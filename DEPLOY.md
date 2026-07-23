# Launching BeamLoop

This guide deploys the backend and points the mobile build at it. Complete the
backend and preview-build smoke test before App Store work.

## 1. Deploy the backend to Railway

The backend is a Node/Fastify server in `server/`. It stores data in SQLite
(`better-sqlite3`) plus media on disk, both under `DATA_DIR`.

1. **Create the project.** In Railway, "New Project → Deploy from GitHub repo"
   (push this repo to GitHub first). Set the service **Root Directory** to
   `server` so Railway builds only the backend.
2. **Config is committed** in `server/railway.json` (Nixpacks build,
   `npm run build` → `npm start`, health check at `/health`).
3. **Add a persistent volume.** Railway → service → Volumes → mount at
   `/app/data`. Container filesystems are wiped on every redeploy, so the
   SQLite DB and retry media MUST live on a volume or you lose all accounts.
4. **Set environment variables** (Railway → Variables):

   | Variable | Value |
   | --- | --- |
   | `POSTFORME_API_KEY` | your real Post for Me API key |
   | `POSTFORME_BASE_URL` | `https://api.postforme.dev` (optional; this is the default) |
   | `APP_JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
   | `DATA_DIR` | `/app/data` (matches the volume mount) |
   | `MEDIA_RETENTION_HOURS` | `168` (retain retry media for seven days) |
   | `CONNECT_REDIRECT_URL` | `beamloop://connections/callback` |
   | `TIKTOK_PRIVACY` | leave as `SELF_ONLY` until TikTok is enabled |
   | `CORS_ORIGIN` | optional comma-separated web origins; leave unset to disable browser CORS |
   | `PUBLIC_LEGAL_NAME` | exact person or company operating BeamLoop |
   | `SUPPORT_EMAIL` | monitored address shown to users and App Review |
   | `PUBLIC_BASE_URL` | `https://beamloop-production.up.railway.app` |
   | `APP_STORE_URL` | optional; add the listing URL after release |

   Railway sets `PORT` automatically — the server already reads it.
5. **Deploy**, then note the public URL Railway gives you (e.g.
   `https://beamloop-production.up.railway.app`). Hit `/health` to confirm.
   You can attach a branded custom API domain later without changing the
   Railway service.
   The same host serves the product site (`/`), support (`/support`), deletion
   instructions (`/account-deletion`), privacy (`/legal/privacy`), and terms
   (`/legal/terms`).

## 2. Point the app at the deployed backend

In `mobile/eas.json`, `preview` and `production` use the Railway production
hostname. Do not build until
`https://beamloop-production.up.railway.app/health` returns `{ "ok": true }`.
If the backend moves, update both EAS profiles and build a new binary.

## 3. Apple Developer account (required to ship)

1. Enroll at <https://developer.apple.com/programs/> ($99/yr). Allow a day for
   approval.
2. In App Store Connect, create the app with bundle ID `com.beamloop.app`.
3. Note your **Team ID** (membership page) and the app's **App Store Connect
   App ID** (a numeric `ascAppId`). Put both into the `submit.production.ios`
   block of `mobile/eas.json` (currently `REPLACE_WITH_*`).

## 4. Build & submit with EAS

Before starting a production build, run `npm run release:check` from
`server/`. It catches unfinished secrets, legal placeholders, and the required
App Store Connect identifiers.

```bash
cd mobile
npm install -g eas-cli   # if needed
eas login
eas build:configure      # links the project to your Expo account
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

`production` has `autoIncrement: true`, so the build number bumps itself each
build. Use `--profile preview` for an internal-distribution build to test on
your own device before the store build.

## 5. App Store listing & compliance

- **Privacy policy URL** (required):
  `https://beamloop-production.up.railway.app/legal/privacy`
- **Support URL** (required):
  `https://beamloop-production.up.railway.app/support`
- **Account deletion URL**:
  `https://beamloop-production.up.railway.app/account-deletion`
- **Terms of service**:
  `https://beamloop-production.up.railway.app/legal/terms`
- Confirm `PUBLIC_LEGAL_NAME` and `SUPPORT_EMAIL` in Railway show the exact
  identity and working inbox you want customers and Apple to use.
- **App Privacy questionnaire** in App Store Connect: declare email + connected
  account credentials as collected, used for app functionality, not for
  tracking.
- **Account deletion**: already implemented in-app (Connections tab → Delete
  account) — Apple checks for this (Guideline 5.1.1(v)).
- **Encryption**: `usesNonExemptEncryption: false` is already set, so the
  export-compliance question is pre-answered.
- Screenshots (6.7" and 6.5" iPhone), description, keywords, support URL, and
  the age-rating questionnaire.

## 6. Smoke-test in a real build

The `beamloop://connections/callback` OAuth redirect only fully works in a
real build (not Expo Go). After the `preview` build installs, connect one
OAuth platform end-to-end and confirm the browser sheet closes and the
connection flips to LIVE.
