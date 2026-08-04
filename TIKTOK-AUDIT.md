# Getting TikTok working for real users

BeamLoop currently publishes through Post for Me's **shared** TikTok API client
(their "Quickstart" project). That client is unaudited, and TikTok caps an
unaudited client at **5 posting users per 24 hours** across everyone using it.
Connecting an account works fine; publishing returns:

```
POST /v2/post/publish/video/init/  ->  403
{ "error": { "code": "reached_active_user_cap" } }
```

BeamLoop therefore talks to TikTok **directly** and leaves Post for Me handling
every other platform. Going through them for TikTok was impossible anyway:

- They send media as `PULL_FROM_URL` from `data.postforme.dev`, and TikTok
  requires that domain to be verified on the posting app. We can't verify a
  domain we don't own, and their upload endpoint gives no control over the
  filename, so a verification file can't be placed there either. `FILE_UPLOAD`,
  which we use, needs no domain verification at all.
- TikTok's audit requires the posting screen to reflect a live `creator_info`
  query. They make that call internally and don't expose it.
- The consent screen names whoever owns the client key. Through them it read
  "PostForMe".

What remains is TikTok's own approval, which no architecture avoids.

## What has to happen, in order

### 1. Register a TikTok developer app — you

- Sign up at <https://developers.tiktok.com/> and create an app for BeamLoop.
- Add the products **Login Kit** and **Content Posting API**.
- Request exactly the scopes BeamLoop uses: `user.info.basic` and
  `video.publish`. Nothing else — TikTok delays a review over any scope it
  can't see demonstrated.
- Platform: **Web** (the OAuth flow is web-based; TikTok's iOS platform expects
  a Universal Link, which this flow never uses).
- Redirect URI — our own, on the domain you already verified:
  `https://beamloop-production.up.railway.app/connections/tiktok/callback`
- Skip "Verify domains". That applies to `pull_by_url`; we use `push_by_file`.
- Have ready: the App Store listing URL, the privacy policy at
  `<PUBLIC_BASE_URL>/legal/privacy`, and the terms at `<PUBLIC_BASE_URL>/legal/terms`.

### 2. Submit for the Content Posting API audit — you

Direct Post requires a separate audit on top of app registration. Until it
passes, every post is forced to `SELF_ONLY` and the 5-user cap stays.

The submission needs a **demo video** showing the complete flow — connecting a
TikTok account through OAuth, then the composer, then a successful post — and it
must cover every scope requested. Reviewers check the posting screen against
TikTok's UX rules line by line.

Expect **1–4 weeks**, often with a round of feedback.

### 3. Set two environment variables — you

Once the app exists, put its credentials in Railway:

```
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
```

Nothing else changes. No Post for Me plan upgrade, no White Label project. Until
both are set, TikTok reports itself unavailable and the connect button returns a
clear "TikTok isn't available yet" rather than failing at publish time.

### 4. Flip the ceiling — one env var

`TIKTOK_PRIVACY` on Railway is currently `SELF_ONLY`, which the server treats as
a **ceiling**: while it is set, every TikTok post is forced private no matter
what the creator picks. That is correct while unaudited. **Once the audit
passes, delete the variable** (it defaults to `public`) and creators get the
choice they made in the composer.

## What the composer already does

TikTok's UX requirements, and where BeamLoop meets them
(all in `TikTokOptionsCard`, [mobile/app/compose.tsx](mobile/app/compose.tsx)):

| TikTok requirement | Status |
| --- | --- |
| Display which creator account the post goes to | Avatar + username at the top of the card |
| Privacy selector with **no** default value | Starts unselected; transmit is blocked until chosen |
| No interaction pre-checked | Comment / Duet / Stitch all start off |
| Duet & Stitch hidden for photo posts | Only rendered when the media is a video |
| Commercial disclosure toggle, default off | "Disclose video content" |
| Requires "Your brand" or "Branded content" when on | Transmit blocked until one is picked |
| Shows the resulting label | "Promotional content" / "Paid partnership" |
| "Only me" unavailable for branded content | Disabled, and turning it on forces public |
| Consent text varies by disclosure | Music Usage Confirmation / + Branded Content Policy |
| Creator has full control of the caption | Shared caption plus a per-platform override |
| Reflects a live `creator_info` query | Fetched each time TikTok is selected; only the privacy levels TikTok returns are offered, and interactions the creator disabled on their account are greyed out |

## Where the code lives

- `server/src/lib/tiktok.ts` — OAuth, `creator_info`, `FILE_UPLOAD` init, chunked
  upload, publish status, and creator-facing error messages
- `server/src/lib/tiktokAccounts.ts` — per-user tokens, refreshed automatically
- `server/src/lib/secrets.ts` — AES-256-GCM for tokens at rest, keyed from
  `APP_JWT_SECRET` (rotating it disconnects TikTok rather than exposing anything)
- `server/src/routes/tiktokAuth.ts` — the public OAuth callback
- `npm run test:tiktok-contract` — contract checks that run without credentials
