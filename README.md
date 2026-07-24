# BeamLoop

Post a video or photo to multiple connected accounts from one compose flow.
The launch set is Instagram, YouTube, Facebook, X, Discord, and Telegram.
TikTok and Threads remain visible in the account list as coming soon and are
not available to connect or publish yet.

## Structure

- `server/` — Fastify/TypeScript backend. It connects OAuth platforms and
  publishes through Post for Me; Discord and Telegram are sent directly.
- `mobile/` — Expo/React Native app. It stores only its BeamLoop session
  locally and talks to the backend.

## Run locally

```bash
cd server
cp .env.example .env
# Set POSTFORME_API_KEY and APP_JWT_SECRET in .env
npm install
npm run dev
```

```bash
cd mobile
cp .env.example .env
# On a physical device, use your Mac's LAN URL rather than localhost.
npm install
npx expo start
```

The OAuth callback is `beamloop://connections/callback`. Test it in a
development or preview build, not Expo Go.

## Product behavior

- Connect, replace, or disconnect an account from the Accounts tab.
- Compose accepts one MP4/MOV/M4V video up to 500 MB or up to 10 JPEG, PNG, or
  WebP photos. Photos are converted to JPEG on-device for compatibility.
- The per-channel tiles are previews, not server-side crops. BeamLoop sends
  the source media to each selected platform.
- X captions are limited to 280 characters; use a platform-specific override
  when the shared caption is longer.
- Upload requests use an idempotency key, so retrying after a network timeout
  returns the original post rather than publishing another copy.
- Publish immediately or choose a one-tap future slot. OAuth schedules are held
  by Post for Me; Discord and Telegram schedules are durably queued in SQLite.
- Instagram and Facebook can target timeline, Reels, or Stories, while reusable
  caption ideas stay private on the device.
- Post Preflight checks connection health, media metadata, platform caption
  limits, Instagram destination, crop risk, and timing before upload.
- Smart Channel Groups turn recurring destination combinations into a single
  tap; Launch Drop coordinates a future release across several channels.
- Post confirmations arrive through a verified provider webhook, with exact
  provider-result and account-feed checks as fallbacks when processing stalls.
  History lets users cancel future posts or retry only explicit failures.

## Backend API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/`, `/support` | Public product and customer-support pages |
| GET | `/legal/privacy`, `/legal/terms` | Public legal documents |
| GET | `/account-deletion` | Public account-deletion instructions |
| POST | `/auth/signup`, `/auth/login` | Create or start a BeamLoop session |
| GET / DELETE | `/auth/me` | Read or remove the BeamLoop account |
| GET | `/connections` | Current platform states |
| POST | `/connections/link` | OAuth connection URL |
| POST | `/connections/discord`, `/connections/telegram` | Save or replace manual credentials |
| DELETE | `/connections/:platform` | Disconnect one platform |
| POST | `/uploads/video`, `/uploads/photos` | Publish selected media (`Idempotency-Key` supported) |
| POST | `/uploads/:id/retry` | Retry failed destinations |
| GET | `/uploads/:id` | Refresh one post's per-channel confirmation |
| DELETE | `/uploads/:id` | Cancel a future scheduled post |
| GET | `/uploads/history` | Post status and retry history |
| POST | `/webhooks/post-for-me` | Verified provider result confirmations |

## Deployment

See [DEPLOY.md](DEPLOY.md). The production EAS profile must point
`EXPO_PUBLIC_API_URL` at a real, HTTPS backend hostname whose `/health` route
returns `{ "ok": true }`.
