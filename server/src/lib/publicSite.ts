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
@font-face {
  font-family: "Archivo Expanded";
  src: url("/assets/archivo-expanded-extra-bold.ttf") format("truetype");
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}
:root {
  color-scheme: dark;
  --page: #05080c;
  --console: #0c121a;
  --strip: #161f2b;
  --sheet: #12191f;
  --editor: #080d12;
  --signal: #e8ecf1;
  --muted: #9aa7b8;
  --mono: #7c8ba0;
  --label: #5e6c7e;
  --line: rgba(255,255,255,.08);
  --line-strong: rgba(255,255,255,.16);
  --success: #3fb971;
  --warning: #e0a63a;
  --link: #5b8df0;
  --tiktok: #2fb6c9;
  --instagram: #c06ce0;
  --youtube: #f26d5b;
  --facebook: #5b8df0;
  --threads: #3fb971;
  --linkedin: #7e6bf2;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--page);
  color: var(--signal);
  font-family: Archivo, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.skip {
  position: absolute; left: -9999px; top: 1rem; z-index: 99;
  background: var(--signal); color: var(--console); padding: .7rem 1rem; border-radius: 12px;
}
.skip:focus { left: 1rem; }
.wrap { width: min(1120px, calc(100% - 40px)); margin: 0 auto; }
.spectrum-rule {
  height: 3px;
  background: linear-gradient(90deg, var(--tiktok) 0 16.6%, var(--instagram) 16.6% 33.2%, var(--youtube) 33.2% 49.8%, var(--facebook) 49.8% 66.4%, var(--warning) 66.4% 83%, var(--threads) 83%);
}
.site-header {
  position: sticky; top: 0; z-index: 20;
  background: rgba(12,18,26,.96);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(18px);
}
.nav {
  min-height: 78px; display: flex; align-items: center; justify-content: space-between; gap: 24px;
}
.brand {
  display: inline-flex; align-items: center; gap: 11px; text-decoration: none;
  font-family: "Archivo Expanded", Archivo, sans-serif; font-size: 18px; letter-spacing: -.04em;
}
.app-icon { width: 42px; height: 42px; border-radius: 12px; display: block; }
.navlinks { display: flex; align-items: center; gap: 6px; }
.navlink {
  color: var(--mono); text-decoration: none; padding: 10px 13px; border: 1px solid transparent;
  border-radius: 10px; font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .1em; text-transform: uppercase; white-space: nowrap;
}
.navlink:hover, .navlink:focus-visible { color: var(--signal); background: var(--strip); }
.navlink.active {
  color: var(--signal); background: var(--strip); border-color: var(--line-strong);
  box-shadow: inset 0 -2px 0 var(--signal);
}
.button {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  min-height: 54px; border: 1px solid var(--line-strong); border-radius: 15px; padding: .8rem 1.2rem;
  text-decoration: none; font-weight: 750; line-height: 1.1;
}
.hero {
  min-height: 680px; padding: 86px 0 74px; display: grid; grid-template-columns: 1.03fr .97fr;
  align-items: center; gap: clamp(38px, 7vw, 90px);
}
.eyebrow {
  display: inline-flex; gap: 9px; align-items: center; color: var(--mono);
  font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .16em; text-transform: uppercase;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 12px rgba(63,185,113,.65); }
h1, h2, h3 {
  font-family: "Archivo Expanded", Archivo, sans-serif;
  line-height: 1; letter-spacing: -.045em; margin-top: 0;
}
.hero h1 { font-size: clamp(54px, 7vw, 92px); margin: 24px 0 22px; max-width: 720px; }
.hero h1 span { color: var(--muted); }
h2 { font-size: clamp(34px, 5vw, 54px); }
h3 { font-size: 21px; letter-spacing: -.035em; }
.lede { max-width: 650px; margin: 0; color: var(--muted); font-size: clamp(17px, 2vw, 20px); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
.button.primary { color: var(--console); background: var(--signal); border-color: var(--signal); }
.button.secondary { background: var(--strip); }
.button:hover { border-color: var(--signal); }
.launch-note { display: flex; align-items: center; gap: 9px; margin-top: 24px; color: var(--mono); font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; }
.console-preview {
  background: var(--console); border: 1px solid var(--line-strong); border-radius: 28px;
  padding: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.42);
}
.preview-bar { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 16px; }
.preview-bar span { color: var(--mono); font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; }
.preview-bar b { color: var(--success); font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
.burst-stage {
  position: relative; height: 350px; overflow: hidden; border-radius: 18px;
  background: repeating-linear-gradient(135deg, #141d27 0 10px, #182430 10px 20px);
  border: 1px solid var(--line);
}
.beams { position: absolute; inset: 0; width: 100%; height: 100%; }
.beams line { stroke: rgba(232,236,241,.25); stroke-width: 1.5; stroke-dasharray: 5 7; }
.source-node {
  position: absolute; left: 50%; top: 50%; translate: -50% -50%; width: 92px; height: 92px;
  padding: 8px; border-radius: 24px; background: var(--signal); box-shadow: 0 0 34px rgba(232,236,241,.28);
}
.source-node img { width: 100%; height: 100%; border-radius: 18px; display: block; }
.burst-node {
  position: absolute; width: 50px; height: 50px; display: grid; place-items: center;
  border-radius: 13px; color: #071016; font: 800 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: 0 0 20px color-mix(in srgb, var(--hue) 45%, transparent); background: var(--hue);
}
.n1 { --hue: var(--tiktok); left: 11%; top: 15%; }
.n2 { --hue: var(--instagram); right: 11%; top: 15%; }
.n3 { --hue: var(--youtube); left: 7%; top: 59%; }
.n4 { --hue: var(--facebook); right: 7%; top: 59%; }
.n5 { --hue: var(--warning); left: 27%; bottom: 7%; }
.n6 { --hue: var(--threads); right: 27%; bottom: 7%; }
.preview-caption { padding: 16px 4px 2px; display: flex; justify-content: space-between; gap: 16px; color: var(--mono); font: 700 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }
.channel-strip {
  display: flex; flex-wrap: wrap; gap: 8px; margin: 30px 0 0;
  color: var(--mono); font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: uppercase; letter-spacing: .1em;
}
.channel-strip span { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--editor); }
.section { padding: 78px 0; }
.section-head { max-width: 680px; margin-bottom: 2.5rem; }
.section-head p, .muted { color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.card {
  padding: 22px; border: 1px solid var(--line); border-radius: 18px;
  background: var(--strip); min-height: 230px;
}
.card .num { color: var(--mono); font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; }
.card h3 { margin: 3.4rem 0 .65rem; }
.card p { color: var(--muted); margin: 0; }
.feature-wide {
  display: grid; grid-template-columns: 1.15fr .85fr; gap: 2rem; align-items: center;
  padding: 34px; border: 1px solid var(--line); border-radius: 20px; background: var(--console);
}
.preflight { display: grid; gap: .6rem; }
.check {
  display: flex; align-items: center; gap: .7rem; padding: 13px 14px;
  border-radius: 12px; border: 1px solid var(--line); background: var(--strip);
  color: var(--muted); font-size: .9rem;
}
.check b { color: var(--success); }
.legal-hero, .support-hero { padding: 80px 0 42px; max-width: 820px; border-bottom: 1px solid var(--line); }
.legal-hero h1, .support-hero h1 { font-size: clamp(46px, 8vw, 76px); margin: 22px 0; }
.prose { max-width: 780px; padding-bottom: 5rem; }
.prose h2 { font-size: 26px; margin: 2.8rem 0 .8rem; }
.prose h3 { margin: 2rem 0 .5rem; }
.prose p, .prose li { color: var(--muted); }
.prose a { color: var(--signal); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.prose ul, .prose ol { padding-left: 1.3rem; }
.notice {
  border-left: 3px solid var(--link); background: var(--strip);
  padding: 16px 18px; border-radius: 0 12px 12px 0; color: var(--signal);
}
.scroll-x { overflow-x: auto; margin: 1.5rem 0; border: 1px solid var(--line); border-radius: 12px; }
.compare { width: 100%; min-width: 460px; border-collapse: collapse; background: var(--strip); }
.compare th {
  text-align: left; padding: 12px 16px; font-family: JetBrains Mono, ui-monospace, monospace;
  font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--label);
  border-bottom: 1px solid var(--line); white-space: nowrap;
}
.compare td { padding: 12px 16px; border-bottom: 1px solid var(--line); color: var(--muted); }
.compare tbody tr:last-child td { border-bottom: 0; }
.compare td:first-child { color: var(--signal); }
.compare td:last-child { color: var(--success); }
.support-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0 3rem; }
.support-card {
  border: 1px solid var(--line); background: var(--strip); border-radius: 18px;
  padding: 22px; text-decoration: none;
}
.support-card:hover { border-color: var(--line-strong); background: #1c2836; }
.support-card small { display: block; color: var(--mono); text-transform: uppercase; letter-spacing: .12em; margin-bottom: 1rem; }
.support-card strong { display: block; font-family: "Archivo Expanded", Archivo, sans-serif; font-size: 18px; overflow-wrap: anywhere; }
details { border-top: 1px solid var(--line); padding: 1rem 0; }
details:last-child { border-bottom: 1px solid var(--line); }
summary { cursor: pointer; font-weight: 750; }
details p { margin-bottom: .2rem; }
.steps { counter-reset: step; display: grid; gap: 1rem; margin: 2rem 0; padding: 0; list-style: none; }
.steps li {
  counter-increment: step; position: relative; padding: 1.1rem 1.1rem 1.1rem 4rem;
  border: 1px solid var(--line); border-radius: 16px; background: var(--strip);
}
.steps li::before {
  content: counter(step); position: absolute; left: 1rem; top: 1rem; width: 2rem; height: 2rem;
  display: grid; place-items: center; border-radius: 8px; background: var(--signal); color: var(--console); font-weight: 850;
}
footer { border-top: 1px solid var(--line); background: var(--console); padding: 2rem 0 3rem; color: var(--mono); font-size: .86rem; }
.footer-row { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; }
.footer-links { display: flex; flex-wrap: wrap; gap: 1rem; }
.footer-links a { color: var(--muted); text-decoration: none; }
@media (max-width: 760px) {
  .wrap { width: min(100% - 28px, 1120px); }
  .nav { min-height: 0; padding: 12px 0 10px; flex-wrap: wrap; gap: 10px; }
  .brand { font-size: 16px; }
  .app-icon { width: 38px; height: 38px; border-radius: 11px; }
  .navlinks { order: 3; width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
  .navlink { padding: 9px 5px; text-align: center; font-size: 9px; }
  .hero { min-height: 0; padding: 54px 0 44px; grid-template-columns: 1fr; gap: 42px; }
  .hero h1 { font-size: clamp(47px, 14vw, 68px); }
  .console-preview { padding: 12px; border-radius: 22px; }
  .burst-stage { height: 300px; }
  .source-node { width: 78px; height: 78px; border-radius: 20px; }
  .source-node img { border-radius: 15px; }
  .burst-node { width: 44px; height: 44px; border-radius: 11px; }
  .section { padding: 56px 0; }
  .grid, .support-grid, .feature-wide { grid-template-columns: 1fr; }
  .card { min-height: 200px; }
  .legal-hero, .support-hero { padding: 54px 0 32px; }
  .footer-row { align-items: flex-start; flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition: none !important; }
}
`;

function navLink(path: string, href: string, label: string, section: string) {
  const active =
    section === "home"
      ? path === "/"
      : section === "support"
        ? path === "/support" || path === "/account-deletion"
        : section === "privacy"
          ? path === "/legal/privacy"
          : path === "/legal/terms";
  return `<a class="navlink${active ? " active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
}

const RESET_FORM_CSS = `
.reset-form{display:flex;flex-direction:column;gap:10px;max-width:420px}
.reset-form label{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7C8BA0}
.reset-form input{background:#161F2B;border:1px solid rgba(255,255,255,.10);border-radius:12px;
  padding:14px 16px;color:#E8ECF1;font-size:16px}
.reset-form input:focus{outline:2px solid #5B8DF0;outline-offset:1px}
.reset-form button{margin-top:8px;background:#E8ECF1;color:#0C121A;border:0;border-radius:12px;
  padding:15px 20px;font-size:16px;font-weight:700;cursor:pointer}
.reset-form button[disabled]{opacity:.6;cursor:default}
#msg{margin:4px 0 0;font-size:14px;color:#9AA7B8}
#msg.bad{color:#F2545B}
#msg.good{color:#3FB971}
`;

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
  <meta name="theme-color" content="#0c121a">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(options.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(baseUrl)}/assets/app-icon.png">
  <meta name="twitter:card" content="summary">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/assets/app-icon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/app-icon.png">
  <link rel="preload" href="/assets/archivo-expanded-extra-bold.ttf" as="font" type="font/ttf" crossorigin>
  <style>${styles}${RESET_FORM_CSS}</style>
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <div class="spectrum-rule" aria-hidden="true"></div>
  <header class="site-header">
    <nav class="nav wrap" aria-label="Main navigation">
      <a class="brand" href="/"><img class="app-icon" src="/assets/app-icon.png" alt=""><span>BeamLoop</span></a>
      <div class="navlinks">
        ${navLink(options.path, "/", "Home", "home")}
        ${navLink(options.path, "/support", "Support", "support")}
        ${navLink(options.path, "/legal/privacy", "Privacy", "privacy")}
        ${navLink(options.path, "/legal/terms", "Terms", "terms")}
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
        <div class="hero-copy">
          <span class="eyebrow"><span class="dot"></span> Creator publishing console</span>
          <h1>Publish once.<br><span>Hit every channel.</span></h1>
          <p class="lede">Preflight, customize, schedule, and launch across social and community channels without rebuilding the same post eight times.</p>
          <div class="actions">${storeAction}<a class="button secondary" href="/support">Get support</a></div>
          <div class="launch-note"><span class="dot"></span> Built for iPhone · App Store launch underway</div>
          <div class="channel-strip" aria-label="Supported channels">
            <span>Instagram</span><span>YouTube</span><span>Facebook</span><span>X</span>
          </div>
        </div>
        <div class="console-preview" aria-label="BeamLoop multi-channel launch preview">
          <div class="preview-bar"><span>Launch Drop · 09:00</span><b>● Ready</b></div>
          <div class="burst-stage">
            <svg class="beams" viewBox="0 0 400 350" preserveAspectRatio="none" aria-hidden="true">
              <line x1="200" y1="175" x2="64" y2="69"/><line x1="200" y1="175" x2="336" y2="69"/>
              <line x1="200" y1="175" x2="48" y2="226"/><line x1="200" y1="175" x2="352" y2="226"/>
              <line x1="200" y1="175" x2="128" y2="309"/><line x1="200" y1="175" x2="272" y2="309"/>
            </svg>
            <div class="burst-node n1">TT</div><div class="burst-node n2">IG</div>
            <div class="burst-node n3">YT</div><div class="burst-node n4">FB</div>
            <div class="burst-node n5">X</div><div class="burst-node n6">TH</div>
            <div class="source-node"><img src="/assets/app-icon.png" alt=""></div>
          </div>
          <div class="preview-caption"><span>1 source</span><span>6 live destinations</span></div>
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

// The page a reset email links to. Plain HTML with a tiny inline script:
// the app itself may not be installed on the device reading the email.
export function resetPasswordPage(options: { token: string; valid: boolean; nonce: string }) {
  const body = options.valid
    ? `
      <form id="f" class="reset-form" autocomplete="on">
        <input type="hidden" name="token" value="${escapeHtml(options.token)}">
        <label for="pw">New password</label>
        <input id="pw" name="password" type="password" minlength="8" required
               autocomplete="new-password" placeholder="At least 8 characters">
        <label for="pw2">Confirm new password</label>
        <input id="pw2" name="confirm" type="password" minlength="8" required
               autocomplete="new-password" placeholder="Type it again">
        <button type="submit" id="go">Change password</button>
        <p id="msg" role="status" aria-live="polite"></p>
      </form>
      <script nonce="${options.nonce}">
        (function () {
          var f = document.getElementById('f'), msg = document.getElementById('msg'),
              go = document.getElementById('go');
          f.addEventListener('submit', function (e) {
            e.preventDefault();
            var pw = f.password.value, pw2 = f.confirm.value;
            if (pw !== pw2) { msg.textContent = 'Those two passwords do not match.'; msg.className = 'bad'; return; }
            go.disabled = true; msg.className = ''; msg.textContent = 'Changing…';
            fetch('/auth/reset-password', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: f.token.value, password: pw })
            }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
              .then(function (res) {
                if (!res.ok) { go.disabled = false; msg.className = 'bad'; msg.textContent = res.j.error || 'That did not work.'; return; }
                f.innerHTML = '';
                msg.className = 'good';
                msg.textContent = 'Password changed. Open BeamLoop and sign in with it.';
              })
              .catch(function () { go.disabled = false; msg.className = 'bad'; msg.textContent = 'Network problem. Try again.'; });
          });
        })();
      </script>`
    : `<p class="lede">This reset link is invalid, has already been used, or has expired.
         Reset links last ${60} minutes.</p>
       <p><a class="button" href="/support">Get support</a></p>`;

  return shell({
    title: "Reset your password",
    description: "Choose a new password for your BeamLoop account.",
    path: "/reset-password",
    content: `
      <section class="legal-hero wrap">
        <span class="eyebrow">BeamLoop</span>
        <h1>${options.valid ? "Choose a new password" : "Link no longer valid"}</h1>
      </section>
      <article class="prose wrap">${body}</article>`,
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
        <details><summary>A platform will not connect</summary><p>Confirm you are signing into the intended social account and approve the requested publishing access. Return to BeamLoop and refresh Connections. You can disconnect and reconnect an account from the connected account menu.</p></details>
        <details><summary>A post is pending or failed</summary><p>Platform processing can take a few minutes, especially for video. Open History to refresh the result. If one destination fails, the successful destinations remain published and the failed result identifies where to retry.</p></details>
        <details><summary>How do I cancel a scheduled post?</summary><p>Open History, select Scheduled, then cancel the item before its delivery time. A post already accepted or published by a destination may need to be removed directly on that platform.</p></details>
        <details><summary>Where is my media stored?</summary><p>Media is held only as needed to deliver or retry your post. Scheduled media is retained until delivery, and retry media is removed within seven days afterward.</p></details>
        <details><summary>How do I disconnect a social account?</summary><p>Open Connections, tap the connected platform, and choose Disconnect. BeamLoop removes its stored connection and can no longer publish to it.</p></details>
        <details><summary>How do I manage or cancel my subscription?</summary><p>Open Accounts, choose Plans, then Manage Subscription. Apple handles payment and cancellation. Deleting your BeamLoop account or removing the app does not cancel an active App Store subscription.</p></details>
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
        <p>Content already published to Instagram, TikTok, YouTube, Facebook, X, Threads, LinkedIn, or another destination remains under that platform's control. Delete that content from the destination itself.</p>
        <div class="notice"><strong>Apple subscriptions are separate.</strong> Deleting your BeamLoop account does not cancel an App Store subscription. Before deletion, open Plans in BeamLoop and choose Manage Subscription if you want to stop renewal.</div>
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
          <li><strong>Connected accounts:</strong> identifiers and authorization needed to publish to accounts you connect. These OAuth connections are managed through our publishing provider; BeamLoop never receives your password for a connected platform.</li>
          <li><strong>Content and instructions:</strong> photos, videos, captions, titles, destination selections, placement choices, and scheduled delivery times.</li>
          <li><strong>Service data:</strong> request timestamps, delivery status, IP-derived security information, and error logs needed to protect and operate the service.</li>
          <li><strong>Subscription data:</strong> Apple-signed product and transaction identifiers, subscription status and expiry, and the BeamLoop account identifier attached to a purchase. Apple processes payment; BeamLoop does not receive your payment-card details.</li>
        </ul>
        <p>We do not intentionally collect your contacts, precise location, advertising identifier, health information, payment-card details, or cross-app tracking data.</p>
        <h2>3. How we use data</h2>
        <p>We use data to create and secure your account, connect destinations, validate and deliver posts, show delivery history, honor cancellations and deletion requests, prevent abuse, and diagnose reliability problems. Where applicable, processing is necessary to provide the service you request, protect the service, meet legal obligations, or act with your consent.</p>
        <h2>4. Who receives data</h2>
        <ul>
          <li><strong>Post for Me</strong>, our publishing infrastructure provider, receives the content and authorization required to deliver posts.</li>
          <li><strong>Your selected destinations</strong> receive the content you ask BeamLoop to publish and handle it under their own terms and privacy policies.</li>
          <li><strong>Railway</strong> provides hosting and infrastructure used to operate the BeamLoop service.</li>
          <li><strong>Apple</strong> processes App Store purchases, renewals, cancellations, and refunds under Apple's terms and privacy policy.</li>
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
        <h2>7. Plans and App Store subscriptions</h2>
        <p>BeamLoop offers a free plan and auto-renewable Creator and Pro subscriptions. The app shows the current localized price, billing period, and included limits before purchase. Payment is charged to your Apple ID. Your subscription renews automatically unless you cancel at least 24 hours before the end of the current period. Apple may charge the renewal within 24 hours before that period ends.</p>
        <p>Manage or cancel in your App Store account settings. Upgrades and downgrades follow the timing Apple shows during confirmation. Refund requests are handled by Apple under its policies. Deleting your BeamLoop account or uninstalling the app does not cancel your Apple subscription. Paid access requires a verified, active App Store entitlement; published content may remain on destination platforms after access ends.</p>
        <h2>8. Availability</h2>
        <p>We work to keep BeamLoop reliable but provide it on an "as available" basis. Maintenance, network conditions, provider incidents, and platform policy changes can interrupt delivery. Review critical posts and destination results yourself.</p>
        <h2>9. Suspension and termination</h2>
        <p>You may stop using BeamLoop and delete your account at any time. We may restrict or terminate access when reasonably necessary to address abuse, security risk, legal requirements, nonpayment for a future paid service, or a material breach of these Terms.</p>
        <h2>10. Disclaimers and liability</h2>
        <p>To the extent allowed by law, BeamLoop is provided without implied warranties and is not liable for indirect, incidental, special, consequential, or punitive losses, including lost reach, revenue, or opportunity. Nothing in these Terms excludes rights or liability that cannot legally be excluded.</p>
        <h2>11. Changes</h2>
        <p>We may update the service or these Terms. The effective date will change when we do. If a material change requires consent or notice under applicable law, we will provide it before the change takes effect.</p>
        <h2>12. Contact</h2>
        <p>Questions about these Terms can be sent to <a href="${supportHref}">${supportEmail}</a>.</p>
      </article>`,
  });
}

// Content pages target high-intent search. They are written to answer the
// query first and mention BeamLoop second — a page that reads as an advert
// does not rank, and does not convert the people who do land on it.

const PRICE_CHECKED = "Competitor prices checked July 2026 and shown in USD. Vendors change pricing often — check theirs before deciding.";

export function bufferAlternativePage() {
  return shell({
    title: "Buffer Alternative for iPhone",
    description:
      "Buffer charges $5 per channel. BeamLoop includes every channel for one flat price and publishes video to TikTok and Instagram from your phone. An honest comparison.",
    path: "/compare/buffer-alternative",
    content: `
      <section class="legal-hero wrap">
        <span class="eyebrow">Comparison</span>
        <h1>The Buffer alternative built for your phone.</h1>
        <p class="lede" style="margin:0">Buffer bills you for every channel you add. BeamLoop includes them all for one price — and publishes your video instead of reminding you to do it yourself.</p>
      </section>
      <article class="prose wrap">
        <h2>The per-channel problem</h2>
        <p>Buffer's paid plans are priced per channel. Every platform you add is another line on the bill, so a creator posting to seven destinations pays seven times over. BeamLoop charges one flat price per plan regardless of how many channels you publish to.</p>
        <div class="scroll-x">
          <table class="compare">
            <thead><tr><th>Channels</th><th>Buffer Essentials, $5 per channel</th><th>BeamLoop</th></tr></thead>
            <tbody>
              <tr><td>3 channels</td><td>$15 / month</td><td>$9.99 / month · Creator</td></tr>
              <tr><td>5 channels</td><td>$25 / month</td><td>$19.99 / month · Pro</td></tr>
              <tr><td>7 channels</td><td>$35 / month</td><td>$19.99 / month · Pro</td></tr>
              <tr><td>7 channels, paid yearly</td><td>$420 / year</td><td>$159.99 / year · Pro</td></tr>
            </tbody>
          </table>
        </div>
        <p>On the yearly plan that works out at $13.33 a month for every channel BeamLoop supports — less than Buffer charges for three.</p>
        <div class="notice"><strong>Where Buffer is cheaper:</strong> at one or two channels Buffer costs less, and its free plan covers three channels with 10 scheduled posts each — more generous than BeamLoop's free tier of 2 channels and 10 posts a month. Flat pricing only wins once you publish widely.</div>

        <h2>Scheduled, or actually published?</h2>
        <p>This is the difference that matters more than price. Several schedulers cannot publish video directly to every network — instead they send a notification at the scheduled time telling you to open the app and post it by hand. That is a reminder, not automation, and it means your posting still depends on you being awake and holding your phone.</p>
        <p>BeamLoop publishes to your connected accounts directly. You approve once, at the moment you create the post.</p>

        <h2>Built where you already are</h2>
        <p>Most social tools are web apps with a companion mobile app bolted on. If you shoot and edit on your phone, that means exporting to a laptop just to distribute what you already have in your camera roll.</p>
        <p>BeamLoop is an iPhone app first. Pick the video from your library, write per-platform captions, choose your channels, send. Nothing about the workflow assumes a desktop.</p>

        <h2>Honest limits</h2>
        <p>Buffer does several things BeamLoop does not, and if you need them it is the better tool: deeper analytics and reporting, team approval workflows, a browser extension for queueing links while you browse, and a longer track record. BeamLoop is focused on one job — getting a photo or video onto every account you own, quickly, from your phone.</p>

        <h2>What each plan includes</h2>
        <ul>
          <li><strong>Free</strong> — 2 channels, 10 posts a month, 5 scheduled posts.</li>
          <li><strong>Creator, $9.99/month or $79.99/year</strong> — 3 channels, 100 posts a month, 50 scheduled posts, per-platform captions and placements, one year of post history.</li>
          <li><strong>Pro, $19.99/month or $159.99/year</strong> — every channel BeamLoop supports, 500 posts a month, up to 1,000 scheduled posts, Launch Drops, unlimited post history.</li>
        </ul>
        <p>Both yearly plans cost eight months of the monthly price, so a year works out four months free.</p>
        ${storeCta()}
        <p class="muted" style="font-size:.9rem">${PRICE_CHECKED}</p>
      </article>`,
  });
}

export function postTikTokInstagramPage() {
  return shell({
    title: "How to Post to TikTok and Instagram at the Same Time",
    description:
      "Three ways to publish one video to TikTok and Instagram together — native sharing, schedulers, and publishing from your phone — with the trade-offs of each.",
    path: "/guides/post-tiktok-instagram-at-once",
    content: `
      <section class="legal-hero wrap">
        <span class="eyebrow">Guide</span>
        <h1>How to post to TikTok and Instagram at the same time.</h1>
        <p class="lede" style="margin:0">There are three ways to do it. Two are free and tedious, one is not. Here is what each actually costs you.</p>
      </section>
      <article class="prose wrap">
        <p><strong>The short answer:</strong> upload your video to one platform, then either share it to the other using the built-in share sheet, use a scheduling tool that posts to both, or publish to both at once from an app that connects to each account directly. The third is fastest; the first is free but degrades your video.</p>

        <h2>Method 1 — the built-in share sheet</h2>
        <p>Both apps let you share a finished post onward. It costs nothing and needs no extra software.</p>
        <p>The catch is quality. When you export a video that a platform has already compressed and then upload it somewhere else, it gets compressed a second time. The result looks noticeably softer than your original file, and on short-form video that difference is visible.</p>
        <p>The larger catch is watermarks. A video saved from TikTok carries a TikTok watermark, and reposting watermarked content from a competing app is widely reported to suppress reach. Always start from your original file rather than a download.</p>

        <h2>Method 2 — a scheduling tool</h2>
        <p>Schedulers let you write once and queue to several platforms. This works well for photos and text.</p>
        <p>Video is where it gets uneven. Some tools cannot publish video directly to every network and instead send a reminder notification at the scheduled time, expecting you to finish the post by hand. Before committing to a tool, check whether it truly publishes video to the platforms you care about, or only reminds you.</p>
        <p>Most schedulers are also web-first, which means a laptop, which means exporting footage off the phone you shot it on.</p>

        <h2>Method 3 — publish to both from your phone</h2>
        <p>An app that connects directly to your accounts can send one upload to both platforms at once, from your original file, with no re-compression and no watermark.</p>
        <p>This is what BeamLoop does. Pick the video from your library, connect TikTok and Instagram once, and publish to both in a single action. The same upload can go to YouTube, Facebook, X, and Threads at the same time.</p>

        <h2>Write different captions for each</h2>
        <p>Posting identical text everywhere is the most common mistake. The audiences behave differently: TikTok rewards a hook in the first line, Instagram tolerates longer copy, and hashtag conventions differ on each.</p>
        <p>BeamLoop's Creator and Pro plans include per-platform captions, so one upload can carry a different hook per destination without creating the post twice.</p>

        <h2>Should you post at the same time?</h2>
        <p>Simultaneous posting is fine and is what most creators do. If you want to test which platform drives more of your growth, staggering by a few hours makes the attribution clearer. Scheduling exists for exactly that.</p>
        ${storeCta()}
      </article>`,
  });
}

export function crossPostReelsPage() {
  return shell({
    title: "Cross-Post Reels to TikTok and YouTube Shorts",
    description:
      "One vertical video, every short-form platform. How to cross-post Reels to TikTok, YouTube Shorts, Facebook, and Threads from a single upload — without watermarks.",
    path: "/guides/cross-post-reels-shorts-tiktok",
    content: `
      <section class="legal-hero wrap">
        <span class="eyebrow">Guide</span>
        <h1>Cross-post Reels to TikTok, Shorts, and everywhere else.</h1>
        <p class="lede" style="margin:0">One vertical video fits every short-form platform. The mistake most people make is how they move it between them.</p>
      </section>
      <article class="prose wrap">
        <h2>Never re-download to repost</h2>
        <p>The usual approach is to post to one platform, save the video back to your camera roll, then upload it to the next. This is the single most damaging habit in short-form video, for two reasons.</p>
        <p>First, the saved file carries the originating platform's watermark. Reposting watermarked content from a competing service is widely reported to suppress distribution — you are advertising a rival inside their app, and the recommendation systems are not enthusiastic about it.</p>
        <p>Second, every save-and-reupload cycle re-compresses the video. Do it across four platforms and the last one receives a visibly degraded copy of your work.</p>
        <div class="notice"><strong>The rule:</strong> always publish from your original export, once per platform, never from a download.</div>

        <h2>One master file, four destinations</h2>
        <p>Export a single vertical file at 1080&times;1920 and publish that same file to each platform. A 9:16 video is accepted natively by Reels, TikTok, YouTube Shorts, Facebook, and Threads, so there is no need to produce separate versions.</p>
        <p>BeamLoop takes one upload from your library and delivers it to every connected account at once, from that original file.</p>

        <h2>What to change per platform</h2>
        <ul>
          <li><strong>TikTok</strong> — front-load the hook. The caption is short and the first line does the work.</li>
          <li><strong>Instagram Reels</strong> — more room for context, and hashtags behave differently from TikTok's.</li>
          <li><strong>YouTube Shorts</strong> — the title is a separate field and matters far more than the description for discovery.</li>
          <li><strong>Facebook and Threads</strong> — usually an older audience and a more conversational register than the same clip needs on TikTok.</li>
        </ul>
        <p>Per-platform captions on the Creator and Pro plans let one upload carry different text and titles for each destination, rather than rebuilding the post four times.</p>

        <h2>Timing</h2>
        <p>Publishing everywhere at once is the normal approach and costs you nothing. Stagger only if you want to read which platform is actually driving growth, since simultaneous posts make that hard to separate.</p>

        <h2>Which tools reach all four</h2>
        <p>Check two things before choosing any tool: whether it publishes video <em>directly</em> to each platform rather than sending you a reminder to post manually, and whether it works on the device you actually shoot on. Plenty of schedulers cover the platforms on paper but fall back to notifications for video, or assume you are sitting at a desktop.</p>
        <p>BeamLoop publishes directly, from an iPhone, to TikTok, Instagram, YouTube, Facebook, X, and Threads.</p>
        ${storeCta()}
      </article>`,
  });
}

function storeCta() {
  return config.APP_STORE_URL
    ? `<div class="actions"><a class="button primary" href="${escapeHtml(config.APP_STORE_URL)}">Download on the App Store</a></div>`
    : "";
}

export function robotsText() {
  return `User-agent: *\nAllow: /\nDisallow: /auth/\nDisallow: /admin\nDisallow: /connections\nDisallow: /uploads/\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

export function sitemapXml() {
  const paths = [
    "/",
    "/support",
    "/compare/buffer-alternative",
    "/guides/post-tiktok-instagram-at-once",
    "/guides/cross-post-reels-shorts-tiktok",
    "/account-deletion",
    "/legal/privacy",
    "/legal/terms",
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((path) => `<url><loc>${baseUrl}${path}</loc></url>`)
    .join("")}</urlset>`;
}

export function securityText() {
  return `Contact: ${baseUrl}/support\nPreferred-Languages: en\nCanonical: ${baseUrl}/.well-known/security.txt\nPolicy: ${baseUrl}/legal/terms\n`;
}
