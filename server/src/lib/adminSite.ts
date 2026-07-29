/**
 * Server-rendered markup for the /admin console.
 *
 * Deliberately dependency-free and read-only: every page here is a view over
 * the database. Nothing in this file mutates state, and nothing renders a
 * password hash, reset token, or push token value.
 */

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string
  );

// Matches the app's design tokens (src/theme.ts) so the console reads as part
// of BeamLoop rather than a bolted-on tool.
const css = `
  :root {
    --console: #0C121A; --strip: #161F2B; --sheet: #12191F;
    --text: #E8ECF1; --dim: #9AA7B8; --mono: #7C8BA0; --label: #5E6C7E;
    --line: rgba(255,255,255,0.08); --hair: rgba(255,255,255,0.06);
    --ok: #3FB971; --warn: #E0A63A; --bad: #F2545B; --link: #5B8DF0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--console); color: var(--text);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 20px 64px; }
  header.bar {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; border-bottom: 1px solid var(--line);
    padding-bottom: 16px; margin-bottom: 24px;
  }
  h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.14em;
       color: var(--label); margin: 32px 0 12px; font-weight: 600; }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .muted { color: var(--dim); font-size: 13px; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--mono); }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .stat { background: var(--strip); border: 1px solid var(--hair); border-radius: 14px; padding: 16px; }
  .stat .n { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  .stat .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--label); margin-top: 4px; }

  .scroll { overflow-x: auto; border: 1px solid var(--hair); border-radius: 14px; background: var(--strip); }
  table { width: 100%; border-collapse: collapse; min-width: 640px; }
  th, td { text-align: left; padding: 11px 14px; border-bottom: 1px solid var(--hair); vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--label); font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }

  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px;
          border: 1px solid var(--line); color: var(--dim); white-space: nowrap; }
  .pill.ok { color: var(--ok); border-color: rgba(63,185,113,0.35); }
  .pill.warn { color: var(--warn); border-color: rgba(224,166,58,0.35); }
  .pill.bad { color: var(--bad); border-color: rgba(242,84,91,0.35); }

  .card { background: var(--strip); border: 1px solid var(--hair); border-radius: 14px; padding: 18px; }
  dl.kv { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 8px 18px; margin: 0; }
  dl.kv dt { color: var(--label); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; }
  dl.kv dd { margin: 0; word-break: break-all; }

  form.login { max-width: 360px; margin: 14vh auto 0; }
  form.login .card { display: grid; gap: 14px; }
  input[type=password] {
    width: 100%; padding: 13px 14px; border-radius: 12px; background: var(--sheet);
    border: 1px solid var(--line); color: var(--text); font-size: 15px;
  }
  button {
    padding: 13px 16px; border-radius: 12px; border: none; background: var(--text);
    color: var(--console); font-size: 15px; font-weight: 700; cursor: pointer;
  }
  button.ghost { background: transparent; color: var(--dim); border: 1px solid var(--line); font-weight: 500; padding: 7px 12px; font-size: 13px; }
  .err { color: var(--bad); font-size: 13px; }
  .empty { padding: 22px 14px; color: var(--dim); font-size: 14px; }
`;

function layout(title: string, body: string, opts: { authed?: boolean } = {}) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · BeamLoop admin</title>
<style>${css}</style>
</head><body><div class="wrap">${
    opts.authed
      ? `<header class="bar">
      <div>
        <h1><a href="/admin" style="color:inherit">BeamLoop admin</a></h1>
        <div class="muted">Read-only view of the production database.</div>
      </div>
      <form method="post" action="/admin/logout"><button class="ghost" type="submit">Sign out</button></form>
    </header>`
      : ""
  }${body}</div></body></html>`;
}

export function adminLoginPage(error?: string) {
  return layout(
    "Sign in",
    `<form class="login" method="post" action="/admin/login">
      <div class="card">
        <div>
          <h1>BeamLoop admin</h1>
          <div class="muted">Enter the admin password.</div>
        </div>
        ${error ? `<div class="err">${esc(error)}</div>` : ""}
        <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>
        <button type="submit">Sign in</button>
      </div>
    </form>`
  );
}

// ---------------------------------------------------------------- dashboard

export interface AdminUserRow {
  id: string;
  email: string;
  createdAt: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  posts: number;
  channels: number | null;
}

export interface AdminPostRow {
  id: string;
  email: string;
  userId: string;
  kind: string;
  title: string;
  createdAt: string;
  scheduledAt: string | null;
  platforms: string[];
  results: Array<{ platform: string; success: boolean; pending?: boolean; error?: string }>;
}

const when = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? esc(value)
    : d.toISOString().replace("T", " ").slice(0, 16) + "Z";
};

const planPill = (plan: string) =>
  `<span class="pill${plan === "free" ? "" : " ok"}">${esc(plan)}</span>`;

function resultPills(row: AdminPostRow) {
  if (row.scheduledAt && new Date(row.scheduledAt).getTime() > Date.now()) {
    return `<span class="pill warn">scheduled</span>`;
  }
  if (row.results.length === 0) return `<span class="pill">no results</span>`;
  return row.results
    .map((r) => {
      const cls = r.pending ? "warn" : r.success ? "ok" : "bad";
      const title = r.error ? ` title="${esc(r.error)}"` : "";
      return `<span class="pill ${cls}"${title}>${esc(r.platform)}</span>`;
    })
    .join(" ");
}

export function adminDashboardPage(data: {
  stats: { users: number; posts: number; posts7d: number; scheduled: number; paying: number; failed7d: number };
  planCounts: Record<string, number>;
  users: AdminUserRow[];
  posts: AdminPostRow[];
}) {
  const { stats } = data;
  const stat = (n: number | string, k: string) =>
    `<div class="stat"><div class="n">${esc(n)}</div><div class="k">${esc(k)}</div></div>`;

  const usersTable = data.users.length
    ? `<div class="scroll"><table>
        <tr><th>Email</th><th>Plan</th><th>Signed up</th><th class="num">Posts</th><th>Renews</th></tr>
        ${data.users
          .map(
            (u) => `<tr>
              <td><a href="/admin/users/${encodeURIComponent(u.id)}">${esc(u.email)}</a></td>
              <td>${planPill(u.plan)}</td>
              <td class="mono">${when(u.createdAt)}</td>
              <td class="num">${u.posts}</td>
              <td class="mono">${when(u.expiresAt)}</td>
            </tr>`
          )
          .join("")}
      </table></div>`
    : `<div class="card empty">No users yet.</div>`;

  const postsTable = data.posts.length
    ? `<div class="scroll"><table>
        <tr><th>When</th><th>User</th><th>Post</th><th>Channels</th></tr>
        ${data.posts
          .map(
            (p) => `<tr>
              <td class="mono">${when(p.scheduledAt ?? p.createdAt)}</td>
              <td><a href="/admin/users/${encodeURIComponent(p.userId)}">${esc(p.email)}</a></td>
              <td>${esc(p.title || "(no caption)")}<div class="mono">${esc(p.kind)}</div></td>
              <td>${resultPills(p)}</td>
            </tr>`
          )
          .join("")}
      </table></div>`
    : `<div class="card empty">No posts yet.</div>`;

  return layout(
    "Overview",
    `<div class="stats">
      ${stat(stats.users, "Users")}
      ${stat(stats.paying, "Paying")}
      ${stat(stats.posts, "Posts")}
      ${stat(stats.posts7d, "Posts · 7d")}
      ${stat(stats.scheduled, "Scheduled")}
      ${stat(stats.failed7d, "Failed · 7d")}
    </div>

    <h2>Plans</h2>
    <div class="stats">
      ${Object.entries(data.planCounts)
        .map(([plan, n]) => stat(n, plan))
        .join("")}
    </div>

    <h2>Users</h2>
    ${usersTable}

    <h2>Recent posts</h2>
    ${postsTable}`,
    { authed: true }
  );
}

// -------------------------------------------------------------- user detail

export function adminUserPage(data: {
  user: { id: string; email: string; createdAt: string; socialExternalId: string | null };
  entitlement: { plan: string; status: string; expiresAt: string | null; willRenew: boolean | null };
  usage: { postsThisMonth: number; scheduledPosts: number; resetsAt: string };
  subscriptions: Array<{
    originalTransactionId: string;
    productId: string;
    status: string;
    environment: string;
    expiresAt: string | null;
    autoRenewStatus: number | null;
  }>;
  devices: number;
  posts: AdminPostRow[];
}) {
  const { user, entitlement, usage } = data;

  const subsTable = data.subscriptions.length
    ? `<div class="scroll"><table>
        <tr><th>Product</th><th>Status</th><th>Env</th><th>Expires</th><th>Auto-renew</th></tr>
        ${data.subscriptions
          .map(
            (s) => `<tr>
              <td class="mono">${esc(s.productId)}</td>
              <td><span class="pill ${s.status === "revoked" || s.status === "expired" ? "bad" : "ok"}">${esc(s.status)}</span></td>
              <td class="mono">${esc(s.environment)}</td>
              <td class="mono">${when(s.expiresAt)}</td>
              <td>${s.autoRenewStatus === null ? "—" : s.autoRenewStatus === 1 ? "on" : "off"}</td>
            </tr>`
          )
          .join("")}
      </table></div>`
    : `<div class="card empty">No App Store subscriptions recorded.</div>`;

  // Sandbox rows survive a review pass and keep the product bound to whoever
  // claimed it, which blocks the next reviewer from buying it at all. Offered
  // only when there is something to clear, and never for production rows.
  const sandboxCount = data.subscriptions.filter(
    (s) => s.environment.toLowerCase() === "sandbox"
  ).length;
  const clearSandbox = sandboxCount
    ? `<form method="post" action="/admin/users/${esc(user.id)}/subscriptions/sandbox"
             onsubmit="return confirm('Delete ${sandboxCount} sandbox subscription record(s)? Production entitlements are not touched.')">
         <button type="submit">Clear ${sandboxCount} sandbox record${sandboxCount === 1 ? "" : "s"}</button>
       </form>`
    : "";

  const postsTable = data.posts.length
    ? `<div class="scroll"><table>
        <tr><th>When</th><th>Post</th><th>Channels</th></tr>
        ${data.posts
          .map(
            (p) => `<tr>
              <td class="mono">${when(p.scheduledAt ?? p.createdAt)}</td>
              <td>${esc(p.title || "(no caption)")}<div class="mono">${esc(p.kind)} · ${esc(p.id)}</div></td>
              <td>${resultPills(p)}</td>
            </tr>`
          )
          .join("")}
      </table></div>`
    : `<div class="card empty">No posts yet.</div>`;

  return layout(
    user.email,
    `<p><a href="/admin">&larr; All users</a></p>
    <h1>${esc(user.email)}</h1>

    <h2>Account</h2>
    <div class="card">
      <dl class="kv">
        <dt>User ID</dt><dd class="mono">${esc(user.id)}</dd>
        <dt>Provider ID</dt><dd class="mono">${esc(user.socialExternalId ?? "—")}</dd>
        <dt>Signed up</dt><dd class="mono">${when(user.createdAt)}</dd>
        <dt>Devices</dt><dd>${data.devices} push ${data.devices === 1 ? "token" : "tokens"}</dd>
      </dl>
    </div>

    <h2>Plan</h2>
    <div class="card">
      <dl class="kv">
        <dt>Plan</dt><dd>${planPill(entitlement.plan)}</dd>
        <dt>Status</dt><dd>${esc(entitlement.status)}</dd>
        <dt>Expires</dt><dd class="mono">${when(entitlement.expiresAt)}</dd>
        <dt>Auto-renew</dt><dd>${entitlement.willRenew === null ? "—" : entitlement.willRenew ? "on" : "off"}</dd>
        <dt>This month</dt><dd>${usage.postsThisMonth} posted · ${usage.scheduledPosts} scheduled · resets ${when(usage.resetsAt)}</dd>
      </dl>
    </div>

    <h2>Subscriptions</h2>
    ${subsTable}
    ${clearSandbox}

    <h2>Posts</h2>
    ${postsTable}`,
    { authed: true }
  );
}
