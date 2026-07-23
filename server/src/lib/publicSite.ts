import { config } from "../config.js";

const baseUrl = config.PUBLIC_BASE_URL.replace(/\/+$/, "");

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const legalName = escapeHtml(config.PUBLIC_LEGAL_NAME);
const supportEmail = escapeHtml(config.SUPPORT_EMAIL);
const supportHref = `mailto:${encodeURIComponent(config.SUPPORT_EMAIL)}`;

const styles = `
:root {
  color-scheme: dark;
  --ink: #f7f7f2;
  --muted: #a9adba;
  --dim: #777d8c;
  --panel: rgba(18, 20, 27, .82);
  --panel-solid: #12141b;
  --line: rgba(255,255,255,.1);
  --blue: #6f7cff;
  --cyan: #35d6ff;
  --lime: #b8ff5a;
  --pink: #ff5ec4;
  --orange: #ff985c;
  --bg: #08090d;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background:
    radial-gradient(circle at 10% -5%, rgba(111,124,255,.22), transparent 31rem),
    radial-gradient(circle at 95% 8%, rgba(255,94,196,.13), transparent 28rem),
    var(--bg);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.skip {
  position: absolute; left: -9999px; top: 1rem; z-index: 99;
  background: var(--ink); color: var(--bg); padding: .7rem 1rem; border-radius: .6rem;
}
.skip:focus { left: 1rem; }
.wrap { width: min(1120px, calc(100% - 40px)); margin: 0 auto; }
.nav {
  height: 76px; display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--line);
}
.brand { display: inline-flex; align-items: center; gap: .75rem; text-decoration: none; font-weight: 850; letter-spacing: -.03em; }
.mark {
  width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
  background: linear-gradient(145deg, var(--cyan), var(--blue) 50%, var(--pink));
  box-shadow: 0 0 32px rgba(111,124,255,.3);
}
.mark svg { width: 21px; height: 21px; }
.navlinks { display: flex; align-items: center; gap: 1.4rem; }
.navlinks a { color: var(--muted); text-decoration: none; font-size: .92rem; font-weight: 650; }
.navlinks a:hover, .navlinks a:focus-visible { color: var(--ink); }
.navlinks .pill { color: var(--ink); }
.pill, .button {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  border: 1px solid var(--line); border-radius: 999px; padding: .68rem 1rem;
  text-decoration: none; font-weight: 750; line-height: 1.1;
}
.hero { padding: 7.5rem 0 5.5rem; text-align: center; position: relative; }
.eyebrow {
  display: inline-flex; gap: .5rem; align-items: center; border: 1px solid var(--line);
  background: rgba(255,255,255,.035); padding: .45rem .8rem; border-radius: 999px;
  color: var(--muted); font: 700 .75rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .08em; text-transform: uppercase;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 15px var(--lime); }
h1, h2, h3 { line-height: 1.06; letter-spacing: -.045em; margin-top: 0; }
h1 { font-size: clamp(3.4rem, 9vw, 7.8rem); max-width: 1000px; margin: 1.5rem auto; }
h2 { font-size: clamp(2rem, 4vw, 3.5rem); }
h3 { font-size: 1.2rem; letter-spacing: -.025em; }
.gradient {
  background: linear-gradient(95deg, var(--cyan), #a7b0ff 44%, var(--pink) 72%, var(--orange));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.lede { max-width: 680px; margin: 0 auto; color: var(--muted); font-size: clamp(1.08rem, 2vw, 1.3rem); }
.actions { display: flex; flex-wrap: wrap; gap: .8rem; justify-content: center; margin-top: 2rem; }
.button { padding: .95rem 1.25rem; }
.button.primary { color: #090a0d; background: var(--ink); border-color: var(--ink); }
.button.secondary { background: rgba(255,255,255,.04); }
.button:hover { transform: translateY(-1px); }
.channel-strip {
  display: flex; flex-wrap: wrap; justify-content: center; gap: .65rem; margin: 3rem auto 0;
  color: var(--dim); font: 650 .76rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: uppercase; letter-spacing: .07em;
}
.channel-strip span { padding: .5rem .72rem; border: 1px solid var(--line); border-radius: .55rem; background: rgba(255,255,255,.025); }
.section { padding: 5rem 0; }
.section-head { max-width: 680px; margin-bottom: 2.5rem; }
.section-head p, .muted { color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.card {
  padding: 1.5rem; border: 1px solid var(--line); border-radius: 1.25rem;
  background: linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018));
  min-height: 220px;
}
.card .num { color: var(--dim); font: 700 .74rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; }
.card h3 { margin: 3.4rem 0 .65rem; }
.card p { color: var(--muted); margin: 0; }
.feature-wide {
  display: grid; grid-template-columns: 1.15fr .85fr; gap: 2rem; align-items: center;
  padding: 2.2rem; border: 1px solid var(--line); border-radius: 1.5rem;
  background: var(--panel);
}
.preflight { display: grid; gap: .6rem; }
.check {
  display: flex; align-items: center; gap: .7rem; padding: .78rem .85rem;
  border-radius: .75rem; border: 1px solid var(--line); background: rgba(0,0,0,.18);
  color: var(--muted); font-size: .9rem;
}
.check b { color: var(--lime); }
.legal-hero, .support-hero { padding: 5.5rem 0 2.5rem; max-width: 760px; }
.legal-hero h1, .support-hero h1 { font-size: clamp(2.7rem, 7vw, 5.2rem); margin: 1rem 0; }
.prose { max-width: 780px; padding-bottom: 5rem; }
.prose h2 { font-size: 1.65rem; margin: 2.8rem 0 .8rem; }
.prose h3 { margin: 2rem 0 .5rem; }
.prose p, .prose li { color: #c0c3cc; }
.prose a { color: #dfe2ff; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.prose ul, .prose ol { padding-left: 1.3rem; }
.notice {
  border-left: 3px solid var(--blue); background: rgba(111,124,255,.09);
  padding: 1rem 1.1rem; border-radius: 0 .8rem .8rem 0; color: #d8daf4;
}
.support-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0 3rem; }
.support-card {
  border: 1px solid var(--line); background: var(--panel); border-radius: 1.1rem;
  padding: 1.4rem; text-decoration: none;
}
.support-card:hover { border-color: rgba(111,124,255,.65); }
.support-card small { display: block; color: var(--dim); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 1rem; }
.support-card strong { display: block; font-size: 1.15rem; }
details { border-top: 1px solid var(--line); padding: 1rem 0; }
details:last-child { border-bottom: 1px solid var(--line); }
summary { cursor: pointer; font-weight: 750; }
details p { margin-bottom: .2rem; }
.steps { counter-reset: step; display: grid; gap: 1rem; margin: 2rem 0; padding: 0; list-style: none; }
.steps li {
  counter-increment: step; position: relative; padding: 1.1rem 1.1rem 1.1rem 4rem;
  border: 1px solid var(--line); border-radius: 1rem; background: var(--panel);
}
.steps li::before {
  content: counter(step); position: absolute; left: 1rem; top: 1rem; width: 2rem; height: 2rem;
  display: grid; place-items: center; border-radius: .6rem; background: var(--ink); color: var(--bg); font-weight: 850;
}
footer { border-top: 1px solid var(--line); padding: 2rem 0 3rem; color: var(--dim); font-size: .86rem; }
.footer-row { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; }
.footer-links { display: flex; flex-wrap: wrap; gap: 1rem; }
.footer-links a { color: var(--muted); text-decoration: none; }
@media (max-width: 760px) {
  .wrap { width: min(100% - 28px, 1120px); }
  .nav { height: 66px; }
  .navlinks a:not(.pill) { display: none; }
  .hero { padding: 5rem 0 3.5rem; }
  .grid, .support-grid, .feature-wide { grid-template-columns: 1fr; }
  .card { min-height: 190px; }
  .footer-row { align-items: flex-start; flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition: none !important; }
}
`;

function brandMark() {
  return `<span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3.5h8.2c3.6 0 5.8 1.8 5.8 4.7 0 1.7-.8 3-2.3 3.8 1.9.7 3 2.2 3 4.2 0 3.1-2.4 4.8-6.3 4.8H5V3.5Zm4 3.4v3.6h3.8c1.4 0 2.2-.6 2.2-1.8 0-1.2-.8-1.8-2.2-1.8H9Zm0 6.7v4h4.1c1.7 0 2.6-.7 2.6-2s-.9-2-2.6-2H9Z" fill="#08090d"/></svg></span>`;
}

function shell(options: {
  title: string;
  description: string;
  path: string;
  content: string;
}) {
  const canonical = `${baseUrl}${options.path}`;
  const title = options.path === "/" ? options.title : `${options.title} · BeamLoop`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(options.description)}">
  <meta name="theme-color" content="#08090d">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(options.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(baseUrl)}/brand-card.svg">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>${styles}</style>
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header class="wrap">
    <nav class="nav" aria-label="Main navigation">
      <a class="brand" href="/">${brandMark()}<span>BeamLoop</span></a>
      <div class="navlinks">
        <a href="/#features">Features</a>
        <a href="/legal/privacy">Privacy</a>
        <a class="pill" href="/support">Support</a>
      </div>
    </nav>
  </header>
  <main id="content">${options.content}</main>
  <footer>
    <div class="wrap footer-row">
      <span>© 2026 ${legalName}. Publish once. Be everywhere.</span>
      <span class="footer-links">
        <a href="/support">Support</a>
        <a href="/account-deletion">Delete account</a>
        <a href="/legal/privacy">Privacy</a>
        <a href="/legal/terms">Terms</a>
      </span>
    </div>
  </footer>
</body>
</html>`;
}

export function landingPage() {
  const storeAction = config.APP_STORE_URL
    ? `<a class="button primary" href="${escapeHtml(config.APP_STORE_URL)}">Download on the App Store</a>`
    : `<a class="button primary" href="#features">See what makes it different</a>`;
  return shell({
    title: "BeamLoop — Publish once. Be everywhere.",
    description:
      "Create, preflight, schedule, and publish social content across every channel from one fast, friendly iPhone app.",
    path: "/",
    content: `
      <section class="hero wrap">
        <span class="eyebrow"><span class="dot"></span> Built for iPhone · App Store launch underway</span>
        <h1>One post.<br><span class="gradient">Everywhere it matters.</span></h1>
        <p class="lede">BeamLoop turns multi-channel publishing into one confident flow—with smart checks, reusable channel groups, and coordinated launches.</p>
        <div class="actions">${storeAction}<a class="button secondary" href="/support">Get support</a></div>
        <div class="channel-strip" aria-label="Supported channels">
          <span>Instagram</span><span>TikTok</span><span>YouTube</span><span>Facebook</span><span>X</span><span>Threads</span><span>Discord</span><span>Telegram</span>
        </div>
      </section>
      <section class="section wrap" id="features">
        <div class="section-head">
          <span class="eyebrow">Less busywork. More momentum.</span>
          <h2>Designed around the moment you hit publish.</h2>
          <p>Every detail is built to make sharing faster without trading away control.</p>
        </div>
        <div class="grid">
          <article class="card"><span class="num">01 · PREFLIGHT</span><h3>Catch problems before platforms do.</h3><p>BeamLoop checks captions, media, destinations, formats, and schedules before anything leaves your phone.</p></article>
          <article class="card"><span class="num">02 · SMART GROUPS</span><h3>Your channels, ready in one tap.</h3><p>Save the combinations you use most—from “All social” to a custom launch crew—and select them instantly.</p></article>
          <article class="card"><span class="num">03 · LAUNCH DROP</span><h3>Make the release feel like an event.</h3><p>Coordinate a scheduled drop across social and community channels from a single launch control.</p></article>
          <article class="card"><span class="num">04 · INSTAGRAM</span><h3>Post, Reel, or Story. Your call.</h3><p>Choose the destination intentionally instead of hoping a generic upload lands in the right place.</p></article>
          <article class="card"><span class="num">05 · CUSTOMIZE</span><h3>One idea, native everywhere.</h3><p>Start with one caption, then tailor the message for each channel without duplicating the whole post.</p></article>
          <article class="card"><span class="num">06 · HISTORY</span><h3>Know what happened at a glance.</h3><p>Track scheduled, pending, successful, and failed deliveries—and cancel upcoming drops when plans change.</p></article>
        </div>
      </section>
      <section class="section wrap">
        <div class="feature-wide">
          <div>
            <span class="eyebrow">Post Preflight</span>
            <h2>Confidence before send.</h2>
            <p class="muted">BeamLoop turns platform rules into friendly, useful checks. Critical issues stop the post; helpful warnings keep you informed without getting in the way.</p>
          </div>
          <div class="preflight" aria-label="Example preflight checks">
            <div class="check"><b>✓</b> All selected channels connected</div>
            <div class="check"><b>✓</b> Media fits selected destinations</div>
            <div class="check"><b>✓</b> Captions inside platform limits</div>
            <div class="check"><b>✓</b> Launch time is ready</div>
          </div>
        </div>
      </section>`,
  });
}

export function supportPage() {
  return shell({
    title: "Support",
    description: "Get help with BeamLoop accounts, connections, publishing, scheduling, and data requests.",
    path: "/support",
    content: `
      <section class="support-hero wrap">
        <span class="eyebrow"><span class="dot"></span> Human support</span>
        <h1>How can we help?</h1>
        <p class="lede" style="margin:0">Tell us what happened and include the affected platform and approximate time. Never email passwords, bot tokens, or webhook URLs.</p>
      </section>
      <section class="prose wrap">
        <div class="support-grid">
          <a class="support-card" href="${supportHref}?subject=BeamLoop%20support%20request"><small>General support</small><strong>${supportEmail}</strong><span class="muted">Account, connection, or publishing help</span></a>
          <a class="support-card" href="/account-deletion"><small>Privacy controls</small><strong>Delete your account</strong><span class="muted">Instructions and what gets removed</span></a>
        </div>
        <h2>Quick answers</h2>
        <details><summary>A platform will not connect</summary><p>Confirm you are signing into the intended social account and approve the requested publishing access. Return to BeamLoop and refresh Connections. Discord webhooks and Telegram bot details can be replaced from the connected account menu.</p></details>
        <details><summary>A post is pending or failed</summary><p>Platform processing can take a few minutes, especially for video. Open History to refresh the result. If one destination fails, the successful destinations remain published and the failed result identifies where to retry.</p></details>
        <details><summary>How do I cancel a scheduled post?</summary><p>Open History, select Scheduled, then cancel the item before its delivery time. A post already accepted or published by a destination may need to be removed directly on that platform.</p></details>
        <details><summary>Where is my media stored?</summary><p>Media is held only as needed to deliver or retry your post. Scheduled media is retained until delivery, and retry media is removed within seven days afterward.</p></details>
        <details><summary>How do I disconnect a social account?</summary><p>Open Connections, tap the connected platform, and choose Disconnect. BeamLoop removes its stored connection and can no longer publish to it.</p></details>
        <h2>Contact</h2>
        <p>BeamLoop is operated by ${legalName}. Email <a href="${supportHref}">${supportEmail}</a>. We aim to acknowledge support and privacy requests within two business days.</p>
      </section>`,
  });
}

export function accountDeletionPage() {
  return shell({
    title: "Account deletion",
    description: "How to permanently delete your BeamLoop account and associated data.",
    path: "/account-deletion",
    content: `
      <section class="legal-hero wrap">
        <span class="eyebrow">Your account · Your control</span>
        <h1>Delete your BeamLoop account.</h1>
        <p class="lede" style="margin:0">Deletion is available directly inside the app and does not require contacting support.</p>
      </section>
      <article class="prose wrap">
        <h2>Delete from the app</h2>
        <ol class="steps">
          <li>Open BeamLoop and sign in to the account you want to delete.</li>
          <li>Open the <strong>Connections</strong> tab.</li>
          <li>Scroll to <strong>Delete account</strong> and tap it.</li>
          <li>Review the warning and confirm permanent deletion.</li>
        </ol>
        <h2>What deletion removes</h2>
        <p>Your BeamLoop login, connection records, encrypted manual credentials, post history, scheduled posts, and retained media are removed. We also request cancellation or deletion of provider-scheduled posts where supported.</p>
        <p>Content already published to Instagram, TikTok, YouTube, Facebook, X, Threads, Discord, Telegram, or another destination remains under that platform's control. Delete that content from the destination itself.</p>
        <div class="notice">If you cannot access the app, email <a href="${supportHref}?subject=BeamLoop%20account%20deletion">${supportEmail}</a> from your BeamLoop account email. We may ask you to verify ownership before deletion.</div>
      </article>`,
  });
}

export function privacyPage() {
  return shell({
    title: "Privacy Policy",
    description: "How BeamLoop collects, uses, shares, retains, and protects account and publishing data.",
    path: "/legal/privacy",
    content: `
      <section class="legal-hero wrap">
        <span class="eyebrow">Effective 24 July 2026</span>
        <h1>Privacy, in plain language.</h1>
        <p class="lede" style="margin:0">BeamLoop uses your data to deliver the posts you request. We do not sell personal data, run behavioral advertising, or track you across apps.</p>
      </section>
      <article class="prose wrap">
        <h2>1. Who we are</h2>
        <p>BeamLoop is operated by ${legalName}. Questions and privacy requests can be sent to <a href="${supportHref}">${supportEmail}</a>.</p>
        <h2>2. Data we collect</h2>
        <ul>
          <li><strong>Account information:</strong> your email address, an internal account identifier, and a salted password hash. We never store your BeamLoop password in plain text.</li>
          <li><strong>Connected accounts:</strong> identifiers and authorization needed to publish to accounts you connect. OAuth connections are managed through our publishing provider. Discord webhook and Telegram bot details you enter are encrypted at rest.</li>
          <li><strong>Content and instructions:</strong> photos, videos, captions, titles, destination selections, placement choices, and scheduled delivery times.</li>
          <li><strong>Service data:</strong> request timestamps, delivery status, IP-derived security information, and error logs needed to protect and operate the service.</li>
        </ul>
        <p>We do not intentionally collect your contacts, precise location, advertising identifier, health information, payment-card details, or cross-app tracking data.</p>
        <h2>3. How we use data</h2>
        <p>We use data to create and secure your account, connect destinations, validate and deliver posts, show delivery history, honor cancellations and deletion requests, prevent abuse, and diagnose reliability problems. Where applicable, processing is necessary to provide the service you request, protect the service, meet legal obligations, or act with your consent.</p>
        <h2>4. Who receives data</h2>
        <ul>
          <li><strong>Post for Me</strong>, our publishing infrastructure provider, receives the content and authorization required to deliver posts.</li>
          <li><strong>Your selected destinations</strong> receive the content you ask BeamLoop to publish and handle it under their own terms and privacy policies.</li>
          <li><strong>Railway</strong> provides hosting and infrastructure used to operate the BeamLoop service.</li>
          <li><strong>Authorities or professional advisers</strong> may receive limited information when required by law or necessary to protect legal rights and service security.</li>
        </ul>
        <p>We do not sell personal data or share it for targeted advertising.</p>
        <h2>5. Retention</h2>
        <p>Account and connection data is kept while your account is active. Scheduled media is retained until delivery. Media available for retries is removed within seven days after delivery or failure. Operational logs are retained only for a limited security and troubleshooting period. Deleting your account removes BeamLoop-held account data, connection records, schedules, history, and retained media, except information we must temporarily preserve for security or legal obligations.</p>
        <h2>6. Your choices and rights</h2>
        <p>You can disconnect individual destinations or permanently delete your account inside BeamLoop. Depending on where you live, you may also request access, correction, portability, restriction, objection, or deletion. Email <a href="${supportHref}">${supportEmail}</a>. You may also contact your local data-protection authority.</p>
        <h2>7. Security and international processing</h2>
        <p>We use access controls, transport encryption, password hashing, encrypted storage for manually supplied credentials, rate limits, and limited media retention. No system is perfectly secure. Providers and destinations may process data in other countries under safeguards available to them and applicable law.</p>
        <h2>8. Children</h2>
        <p>BeamLoop is not directed to children under 13 or anyone below the minimum age required to use their connected platforms. We do not knowingly collect children's data.</p>
        <h2>9. Changes</h2>
        <p>We may update this policy as BeamLoop changes. We will update the effective date and provide additional notice when a material change requires it.</p>
        <h2>10. Contact</h2>
        <p>${legalName}<br><a href="${supportHref}">${supportEmail}</a><br><a href="/support">BeamLoop Support</a></p>
      </article>`,
  });
}

export function termsPage() {
  return shell({
    title: "Terms of Service",
    description: "The terms that apply when you create an account or publish using BeamLoop.",
    path: "/legal/terms",
    content: `
      <section class="legal-hero wrap">
        <span class="eyebrow">Effective 24 July 2026</span>
        <h1>Terms built for clarity.</h1>
        <p class="lede" style="margin:0">These terms explain the responsibilities that come with using BeamLoop to publish to connected services.</p>
      </section>
      <article class="prose wrap">
        <h2>1. Agreement</h2>
        <p>These Terms are between you and ${legalName} ("BeamLoop", "we", or "us"). By creating an account or using BeamLoop, you agree to them. If you do not agree, do not use the service.</p>
        <h2>2. The service</h2>
        <p>BeamLoop helps you prepare, schedule, and publish content to destinations you select. Delivery relies on Post for Me, hosting providers, and the connected platforms. Features and supported destinations may change.</p>
        <h2>3. Your account</h2>
        <p>You must provide accurate information, protect your credentials, and be old enough to form a binding agreement and use each connected platform. You are responsible for activity performed through your account. Notify us promptly if you suspect unauthorized access.</p>
        <h2>4. Your content and permissions</h2>
        <p>You retain ownership of your content. You grant BeamLoop a limited, non-exclusive permission to store, process, adapt for technical delivery, and transmit it only to operate the service and fulfill your publishing instructions. You confirm that you hold all rights and permissions needed to publish the content.</p>
        <h2>5. Acceptable use</h2>
        <p>Do not use BeamLoop for unlawful, deceptive, infringing, abusive, hateful, harassing, exploitative, or malicious activity; unsolicited spam; platform manipulation; credential theft; security attacks; or content that violates a destination's rules. Do not interfere with, overload, reverse-engineer, or bypass limits protecting the service.</p>
        <h2>6. Connected services</h2>
        <p>Your use of each destination remains governed by that service's terms. A destination may reject, delay, modify, restrict, or remove a post. BeamLoop cannot guarantee acceptance, timing, reach, or continued availability of third-party services.</p>
        <h2>7. Availability</h2>
        <p>We work to keep BeamLoop reliable but provide it on an "as available" basis. Maintenance, network conditions, provider incidents, and platform policy changes can interrupt delivery. Review critical posts and destination results yourself.</p>
        <h2>8. Suspension and termination</h2>
        <p>You may stop using BeamLoop and delete your account at any time. We may restrict or terminate access when reasonably necessary to address abuse, security risk, legal requirements, nonpayment for a future paid service, or a material breach of these Terms.</p>
        <h2>9. Disclaimers and liability</h2>
        <p>To the extent allowed by law, BeamLoop is provided without implied warranties and is not liable for indirect, incidental, special, consequential, or punitive losses, including lost reach, revenue, or opportunity. Nothing in these Terms excludes rights or liability that cannot legally be excluded.</p>
        <h2>10. Changes</h2>
        <p>We may update the service or these Terms. The effective date will change when we do. If a material change requires consent or notice under applicable law, we will provide it before the change takes effect.</p>
        <h2>11. Contact</h2>
        <p>Questions about these Terms can be sent to <a href="${supportHref}">${supportEmail}</a>.</p>
      </article>`,
  });
}

export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#35d6ff"/><stop offset=".52" stop-color="#6f7cff"/><stop offset="1" stop-color="#ff5ec4"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#g)"/><path d="M15 14h22c10 0 16 6 16 15s-6 15-16 15H27v9H15V14Zm12 10v10h9c3 0 5-2 5-5s-2-5-5-5h-9Z" fill="#08090d"/></svg>`;
}

export function brandCardSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><radialGradient id="a"><stop stop-color="#6f7cff" stop-opacity=".5"/><stop offset="1" stop-color="#08090d" stop-opacity="0"/></radialGradient><linearGradient id="b"><stop stop-color="#35d6ff"/><stop offset=".5" stop-color="#a7b0ff"/><stop offset="1" stop-color="#ff5ec4"/></linearGradient></defs><rect width="1200" height="630" fill="#08090d"/><circle cx="180" cy="40" r="420" fill="url(#a)"/><text x="90" y="170" fill="#f7f7f2" font-family="Arial,sans-serif" font-size="44" font-weight="700">BeamLoop</text><text x="90" y="340" fill="url(#b)" font-family="Arial,sans-serif" font-size="100" font-weight="800">Publish once.</text><text x="90" y="445" fill="#f7f7f2" font-family="Arial,sans-serif" font-size="100" font-weight="800">Be everywhere.</text><text x="94" y="535" fill="#a9adba" font-family="Arial,sans-serif" font-size="30">Fast, friendly multi-channel publishing for iPhone.</text></svg>`;
}

export function robotsText() {
  return `User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /connections\nDisallow: /uploads/\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

export function sitemapXml() {
  const paths = ["/", "/support", "/account-deletion", "/legal/privacy", "/legal/terms"];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((path) => `<url><loc>${baseUrl}${path}</loc></url>`)
    .join("")}</urlset>`;
}

export function securityText() {
  return `Contact: ${baseUrl}/support\nPreferred-Languages: en\nCanonical: ${baseUrl}/.well-known/security.txt\nPolicy: ${baseUrl}/legal/terms\n`;
}
