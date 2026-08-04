# Getting TikTok working for real users

BeamLoop currently publishes through Post for Me's **shared** TikTok API client
(their "Quickstart" project). That client is unaudited, and TikTok caps an
unaudited client at **5 posting users per 24 hours** across everyone using it.
Connecting an account works fine; publishing returns:

```
POST /v2/post/publish/video/init/  ->  403
{ "error": { "code": "reached_active_user_cap" } }
```

No code change fixes this. BeamLoop needs its own TikTok API client, audited by
TikTok, configured in Post for Me as a **White Label** project.

## What has to happen, in order

### 1. Register a TikTok developer app — you

- Sign up at <https://developers.tiktok.com/> and create an app for BeamLoop.
- Add the products **Login Kit** and **Content Posting API**.
- Request the scopes BeamLoop uses:
  `user.info.basic`, `video.upload`, `video.publish`, `video.list`.
- Set the redirect URI to Post for Me's callback:
  `https://app.postforme.dev/callback/tiktok/account`
  (confirm this exact value with Post for Me before submitting — it must match
  whatever their White Label flow uses, and TikTok rejects a mismatch at login.)
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

### 3. Configure the credentials in Post for Me — you

Switch the project to White Label and enter the TikTok client key and secret.
White Label is on their paid tier (from $10/mo at the time of writing). Confirm
with their support whether the redirect URI above is right for White Label
projects, since Quickstart uses their own.

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

## The one gap to resolve with Post for Me

TikTok also requires the posting screen to reflect a live `creator_info/query`
call: the privacy options offered must match what that endpoint returns for the
account, and any interaction the creator has disabled in their TikTok settings
must appear greyed out.

Post for Me calls `creator_info/query` internally — it is visible in their
result traces — but **does not expose it through their API**, so BeamLoop cannot
currently reflect it. Ask them directly:

1. Can `creator_info` be exposed for a connected TikTok account?
2. For White Label customers, do they provide audit guidance, or has a customer
   passed the audit through their integration before?

If the answer to (1) is no, raise it in the audit submission rather than letting
a reviewer find it.
