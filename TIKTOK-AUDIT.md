# TikTok

BeamLoop publishes to TikTok directly — its own API client, its own OAuth
consent screen — while Post for Me handles every other platform.

**Status: approved for Direct Post, 15 September 2026** — on the second
submission, after a rejection against points 1–5 of the UX guidelines. Posts now
publish at the visibility the creator chooses, creator accounts no longer have to
be private, and the daily publishing cap is the 500 users we applied for rather
than the unaudited 5.

The approval history is at the bottom; it is worth reading before touching the
posting screen, because most of what looks like an odd design choice there is a
guideline requirement.

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
| `TIKTOK_PRIVACY` | **Must stay unset.** It is a ceiling, not a default: while set to `private` every post is forced `SELF_ONLY` regardless of what the creator chose. It was needed only while unaudited, and was removed on approval. |

Without a key and secret the channel reports itself unavailable rather than
failing at publish time.

## If something breaks

| Symptom | Cause |
| --- | --- |
| `non_sandbox_target` at TikTok's login | A sandbox key is configured, and this account isn't a registered target user. |
| Posts succeed but nobody can see them | `TIKTOK_PRIVACY` is still set. |
| "Please review our integration guidelines" | Unaudited-client rule: the creator's TikTok *account* must be private. Should not occur now that we are audited — if it does, check the client key is the audited one. |
| `reached_active_user_cap` | The daily publishing-user cap. 5 while unaudited; 500 since approval. Request an increase from TikTok with real usage figures. |
| Everyone suddenly disconnected | `APP_JWT_SECRET` changed. Stored tokens are encrypted with a key derived from it, so rotating it forces every creator to reconnect. |

---

# The audit

## Rejection 1 — what TikTok said

> Your application did not follow our UX Guidelines. Please refer to point 1 to
> 5 under 'Required UX Implementation in Your App' in the Content Sharing
> Guidelines. The demo video should show the complete end-to-end flow of the
> integrations with TikTok and the ending must show that had been posted under
> TikTok. Please be more clarify and clear on the scope the application is
> using. Please demonstrate the user experience & how you use TikTok for
> Developers' capabilities inside your app. The full Website URL need to be
> showed in demo video.

Four separate demands. Three are about the video and the form; one is about the
app, and that one was real — the posting screen genuinely failed points 1, 2, 3
and 5.

## What was wrong in the app, and what changed

| Guideline | What we were doing | Fixed |
| --- | --- | --- |
| 1 — use the latest creator info | `creator_info` failures were swallowed by an empty `.catch()`. A creator over their daily posting limit saw a normal screen and a refusal at publish. | The reason comes back from the server as TikTok phrased it and blocks transmit, which is what "stop the current publishing attempt and prompt users to try again later" asks for. |
| 1 — check the video length | `max_video_post_duration_sec` was fetched, typed, and never read. | A clip longer than the account allows blocks transmit and says the limit. |
| 2 — offer the returned privacy levels | Hardcoded to two, "Everyone" and "Only me". Accounts that can post to friends or to followers were never shown those, and the levels weren't spelled TikTok's way. | The selector lists exactly `privacy_level_options`, labelled Everyone / Friends / Followers / Only me, and shows nothing at all until TikTok has answered. |
| 2 — the declaration | The Music Usage Confirmation line only appeared once a commercial disclosure was switched on. On an ordinary post there was no declaration. | Always on screen, with both policies as real links. |
| 3 — commercial disclosure prompt | Read "PICK AT LEAST ONE TO PUBLISH". | TikTok's own wording: "You need to indicate if your content promotes yourself, a third party, or both." |
| 3 — branded content audience | Only "Only me" was blocked, and turning the disclosure on silently rewrote the creator's choice to public. | Branded content is allowed out to everyone or friends only. Both controls grey each other out; neither changes the other's value. |
| 5 — processing delay | Never mentioned. | "After you transmit, TikTok may take a few minutes to process the video before it shows on your profile." |

Points 4 and the rest of 5 already held: the consent text tracks the disclosure
selection, the media is previewed, the caption is the creator's to edit, nothing
is watermarked, transmit is an explicit act, and the server polls
`publish/status` until TikTok settles the post.

The code is in [mobile/app/compose.tsx](mobile/app/compose.tsx) (`TikTokOptionsCard`
and `buildPreflightChecks`), with the privacy levels defined once in
[mobile/src/api/types.ts](mobile/src/api/types.ts) and
[server/src/lib/posts.ts](server/src/lib/posts.ts).

## The demo video

TikTok rejected the last one on four counts. Record a new one against the
**production app**, in one unbroken screen recording, and don't cut anything.

1. **The website, in full.** Open Safari and load the site so the whole URL is
   legible in the address bar, and hold it for a beat. This is the "full Website
   URL" they asked for; a logo is not enough. Use whatever is live and matches
   the URL registered on the TikTok app — today that is
   `https://beamloop-production.up.railway.app`. `beamloop.app` appears only as
   a commented-out CORS example in `server/.env.example`, so unless that domain
   is now pointed at Railway, do not show it.
2. **Open BeamLoop and sign in**, so it's obvious this is a real app and not a
   mockup.
3. **Connect TikTok from scratch.** Start disconnected. Tap Connect, let
   TikTok's own consent screen appear, show the scopes it lists, authorize, and
   land back in BeamLoop with the account connected. This is the Login Kit and
   `user.info.basic` half of the scope question.
4. **Compose a post.** Pick a video, write a caption, select TikTok.
5. **Linger on the posting screen** — this is what they said was missing, and
   it's what points 1–5 are about. Show, slowly enough to read:
   - the creator's nickname and avatar at the top;
   - the privacy selector with nothing selected, then choose one;
   - Comment / Duet / Stitch all off, then turn one on;
   - the commercial disclosure switch, turned on, showing the prompt, then
     "Branded content", showing the "Paid partnership" label and the audience
     narrowing;
   - the declaration line with both policy links;
   - the "may take a few minutes" line.
6. **Transmit**, and stay on the progress screen until it reports success.
7. **Open the TikTok app itself**, go to the creator's profile, and show the
   post there. This is the ending they explicitly asked for — the video must end
   inside TikTok, on the post that was just published, not in BeamLoop.

While unaudited the post is `SELF_ONLY` on a private account, so step 7 shows it
on the creator's own profile where only they can see it. Say so out loud or in a
caption, so the reviewer doesn't read a private post as a failed one.

Narrate throughout, or caption. A silent recording of taps is what "please
demonstrate the user experience" is aimed at.

## The submission text

Paste into "Explain how each product and scope works within your app or
website". Under their 1000-character limit, so edit carefully.

> BeamLoop is a live iPhone app (App Store ID 6794000898, https://beamloop-production.up.railway.app) that publishes one video to several social accounts from a single upload. Our TikTok integration is our own client calling the Content Posting API directly with FILE_UPLOAD.
>
> Login Kit + user.info.basic — used on one screen only, the TikTok posting screen. Before anything can be sent we query creator_info and show the creator's nickname and avatar so they see which account receives the post; we offer exactly the privacy levels it returns, and grey out comment, duet or stitch where that account has disabled them. If it reports the creator cannot post now, we stop and say why.
>
> video.publish — used to send the post the creator has approved: their caption, a privacy level they picked from an unselected list, their comment/duet/stitch choices, and any commercial-content declaration, with the Music Usage Confirmation and Branded Content Policy shown.
>
> No other scope is requested or used.

Two scopes only. Do not add `video.upload` or `video.list`; nothing in the app
uses them, and TikTok delays a review over any scope it cannot see demonstrated.

## Registration, for reference

- App at <https://developers.tiktok.com/>, products **Login Kit** and
  **Content Posting API**, platform **Web** (TikTok's iOS platform expects a
  Universal Link, which this flow never uses).
- Redirect URI:
  `https://beamloop-production.up.railway.app/connections/tiktok/callback`
- Skip "Verify domains" — that applies to `pull_by_url`; we use `push_by_file`.
- Have ready: the App Store listing URL, the privacy policy at
  `<PUBLIC_BASE_URL>/legal/privacy`, the terms at `<PUBLIC_BASE_URL>/legal/terms`.

### While unaudited

TikTok's guidelines: *"All user accounts using the API client to post must be
set to private at the time of posting."* This is separate from the post's own
privacy level — an unaudited client is refused outright by any account that
isn't itself private, and the error is a bare link to the guidelines. Switch the
demo account to Private in TikTok's settings (Settings and privacy → Privacy).
It can go back to public after approval.

### On approval — done 15 September 2026

1. `TIKTOK_PRIVACY` deleted from Railway. While it was set, every post was
   forced `SELF_ONLY` no matter what the creator picked; leaving it in place
   would have made approval invisible to users.
2. No credential swap was needed — Railway already held the **production**
   key (no `sb` prefix). Only relevant if that ever changes: a sandbox key
   (`sb` prefix, e.g. `sbawjb1yepj52rbxzs`) works solely for accounts added as
   sandbox target users.
3. The demo TikTok account can go back to public; the private-account rule
   applied only to unaudited clients.
4. **Ship a build carrying the compliant posting screen.** The audit was granted
   against the UX in the demo video, which landed in v1.2.0 — anything older
   shows creators a screen TikTok has not approved. Older clients still publish
   correctly (`parseTikTokPrivacy` accepts the old `public`/`private` spelling),
   so this is a compliance obligation rather than a functional break.

## Where the code lives

- `server/src/lib/tiktok.ts` — OAuth, `creator_info`, `FILE_UPLOAD` init, chunked
  upload, publish status, and creator-facing error messages
- `server/src/lib/tiktokAccounts.ts` — per-user tokens, refreshed automatically
- `server/src/lib/secrets.ts` — AES-256-GCM for tokens at rest, keyed from
  `APP_JWT_SECRET` (rotating it disconnects TikTok rather than exposing anything)
- `server/src/routes/tiktokAuth.ts` — the public OAuth callback
- `npm run test:tiktok-contract` — contract checks that run without credentials
