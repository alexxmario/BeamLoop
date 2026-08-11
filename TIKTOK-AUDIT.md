# TikTok

**Approved by TikTok for Direct Post.** BeamLoop publishes to TikTok directly —
its own API client, its own OAuth consent screen — while Post for Me handles
every other platform.

This document records why it is built that way and what to check when something
breaks. The approval history is at the bottom.

## How it works

- **OAuth**: `authorization_code`, giving a per-user access token. TikTok's
  *client access token* (`client_credentials`) is for the Research and
  Commercial Content APIs and is not used here.
- **Media**: `FILE_UPLOAD` — we send the bytes. `PULL_FROM_URL` would require
  verifying the domain the media is served from, which is what made publishing
  through Post for Me impossible: their storage is on `data.postforme.dev`, a
  domain we cannot verify, and their upload endpoint gives no control over the
  filename so a verification file cannot be placed there either.
- **Scopes**: `user.info.basic` and `video.publish`. Nothing else — TikTok
  delays a review over any scope it cannot see demonstrated.
- **Posting screen**: driven by a live `creator_info` query, so the privacy
  levels offered are the ones TikTok permits for that account and interactions
  the creator disabled are greyed out. Post for Me makes that call internally
  and never exposed it, which alone would have failed the audit.

## Configuration

| Variable | Value |
| --- | --- |
| `TIKTOK_CLIENT_KEY` | Production key from the app's Credentials panel. An `sb` prefix means the **sandbox** key, which only authorizes accounts registered as sandbox target users. |
| `TIKTOK_CLIENT_SECRET` | Its matching secret. |
| `TIKTOK_REDIRECT_URL` | `<PUBLIC_BASE_URL>/connections/tiktok/callback`, registered on the TikTok app **exactly**. Sandbox and production settings are separate. |
| `TIKTOK_PRIVACY` | **Unset in production.** It is a ceiling, not a default: while set to `private` every post is forced `SELF_ONLY` regardless of what the creator chose. Only needed for an unaudited client. |

Without a key and secret the channel reports itself unavailable rather than
failing at publish time.

## If something breaks

| Symptom | Cause |
| --- | --- |
| `non_sandbox_target` at TikTok's login | A sandbox key is configured, and this account isn't a registered target user. |
| Posts succeed but nobody can see them | `TIKTOK_PRIVACY` is still set. |
| "Please review our integration guidelines" | Unaudited-client rule: the creator's TikTok *account* must be private. Should not occur now that we are audited. |
| `reached_active_user_cap` | Unaudited-client cap of 5 posting users per 24 hours. Should not occur now. |
| Everyone suddenly disconnected | `APP_JWT_SECRET` changed. Stored tokens are encrypted with a key derived from it, so rotating it forces every creator to reconnect. |

## History — how approval was obtained

## What has to happen, in order

### 1. Register a TikTok developer app

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

### 2. Submit for the Content Posting API audit

Direct Post requires a separate audit on top of app registration. Until it
passes, every post is forced to `SELF_ONLY` and the 5-user cap stays.

The submission needs a **demo video** showing the complete flow — connecting a
TikTok account through OAuth, then the composer, then a successful post — and it
must cover every scope requested. Reviewers check the posting screen against
TikTok's UX rules line by line.

Expect **1–4 weeks**, often with a round of feedback.

### 3. Set the credentials

Once the app exists, put its credentials in Railway:

```
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
```

Nothing else changes. No Post for Me plan upgrade, no White Label project. Until
both are set, TikTok reports itself unavailable and the connect button returns a
clear "TikTok isn't available yet" rather than failing at publish time.

### 3b. Swap to production credentials after approval

A sandbox issues its own client key, recognisable by an `sb` prefix
(`sbawjb1yepj52rbxzs`). It only works for the accounts added as sandbox target
users, so leaving it in place after approval keeps TikTok limited to those ten
accounts. Replace `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` with the
production pair from the app's Credentials panel once the audit passes, and make
sure the same redirect URI is registered on the production app too.

### 3c. Private account, while unaudited

TikTok's guidelines: *"All user accounts using the API client to post must be
set to private at the time of posting."* This is separate from the post's own
privacy level — an unaudited client is refused outright by any account that
isn't itself private, and the error is a bare link to the guidelines. Any
account used for the demo must be switched to Private in TikTok's own settings
(Settings and privacy → Privacy). It can go back to public after approval.

### 4. Flip the ceiling — one env var

`TIKTOK_PRIVACY` was set to `SELF_ONLY` while unaudited. The server treats it as
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

## The submission text

Paste this into "Explain how each product and scope works within your app or
website". It is 997 characters against their 1000 limit, so edit carefully.

> BeamLoop is a live iPhone app (App Store ID 6794000898) that publishes one video to several social accounts from a single upload. The TikTok integration is our own: we call the Content Posting API directly and send the video with FILE_UPLOAD.
>
> The demo shows the production app: opening BeamLoop, connecting TikTok via OAuth, writing a caption, choosing the post's settings, and publishing.
>
> Login Kit + user.info.basic - the posting screen queries creator_info and shows the creator's nickname and avatar, so they see which account gets the post. Only the privacy levels creator_info returns are offered, and disabled interactions are greyed out.
>
> video.publish - the creator selects a privacy level (nothing pre-selected; the post cannot be sent until they choose), sets comment/duet/stitch permissions, and declares commercial content where it applies, with the required consent text.
>
> The demo runs in our sandbox on a private account, so the post is SELF_ONLY as an unaudited client requires.

Two scopes only — `user.info.basic` and `video.publish` — because TikTok delays
a review over any scope it cannot see demonstrated. Do not add `video.upload` or
`video.list`; nothing in the app uses them.

## Where the code lives

- `server/src/lib/tiktok.ts` — OAuth, `creator_info`, `FILE_UPLOAD` init, chunked
  upload, publish status, and creator-facing error messages
- `server/src/lib/tiktokAccounts.ts` — per-user tokens, refreshed automatically
- `server/src/lib/secrets.ts` — AES-256-GCM for tokens at rest, keyed from
  `APP_JWT_SECRET` (rotating it disconnects TikTok rather than exposing anything)
- `server/src/routes/tiktokAuth.ts` — the public OAuth callback
- `npm run test:tiktok-contract` — contract checks that run without credentials
