/* FileLab Hosting dashboard. Vanilla JS, no build step. Every action calls the backend API. */
'use strict';

// ---------- tiny helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
const ago = (t) => {
  if (!t) return '—';
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
};
const clock = (t) => new Date(t).toLocaleTimeString([], { hour12: false });
const dur = (a, b) => (b && a ? `${Math.max(0.1, (b - a) / 1000).toFixed(1)}s` : '—');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const I = {
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M7 19V5h10M7 12h7"/></svg>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  rocket: '<path d="M5 15c-1 1-2 4-2 6 2 0 5-1 6-2M14 4c3-1 6-1 7-1 0 1 0 4-1 7l-7 7-6-6zM15 9h.01"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  code: '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  dl: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
};
const ic = (n, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

// ---------- API ----------
class ApiError extends Error { constructor(m, status) { super(m); this.status = status; } }
async function api(method, path, { json, body, headers } = {}) {
  const opt = { method, headers: { ...(headers || {}) }, credentials: 'same-origin' };
  if (json !== undefined) { opt.body = JSON.stringify(json); opt.headers['content-type'] = 'application/json'; }
  else if (body !== undefined) opt.body = body;
  let res;
  try { res = await fetch('/api' + path, opt); } catch { throw new ApiError('Cannot reach the server. Check your connection.', 0); }
  if (res.status === 401 && !path.startsWith('/auth/')) { state.user = null; location.hash = '#/login'; throw new ApiError('Please sign in.', 401); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}

// ---------- state, toasts, modals ----------
const state = { user: null, config: null, cleanup: [] };
function toast(msg, type = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
const fail = (e) => toast(e.message || String(e), 'error', 6500);

function modal({ title, body, actions = [], wide = false, onMount, dismissable = true }) {
  const root = $('#modal-root');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h2>${esc(title)}</h2>${dismissable ? `<button class="iconbtn right" data-close aria-label="Close">${ic('x')}</button>` : ''}</div>
    <div class="modal-b">${body}</div>
    ${actions.length ? `<div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov && dismissable) close(); });
  ov.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return close();
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const a = actions[+b.dataset.i];
    if (a.onClick) {
      b.disabled = true;
      try { const keep = await a.onClick(ov, close); if (keep !== false && !a.stay) close(); } catch (err) { fail(err); }
      b.disabled = false;
    } else close();
  });
  root.appendChild(ov);
  const first = $('input,textarea,select', ov);
  if (first) first.focus();
  if (onMount) onMount(ov, close);
  return { el: ov, close };
}
const confirmBox = (title, message, label = 'Confirm', danger = true) =>
  new Promise((res) => {
    let done = false;
    const m = modal({
      title, body: `<p class="muted">${message}</p>`,
      actions: [{ label: 'Cancel', onClick: () => { done = true; res(false); } }, { label, cls: danger ? 'danger' : 'primary', onClick: () => { done = true; res(true); } }],
    });
    new MutationObserver((_, o) => { if (!document.body.contains(m.el)) { o.disconnect(); if (!done) res(false); } }).observe($('#modal-root'), { childList: true });
  });
const promptBox = (title, label, value = '', cta = 'Save') =>
  new Promise((res) => {
    let done = false;
    const m = modal({
      title, body: `<div class="field"><label>${esc(label)}</label><input type="text" id="pb-in" value="${esc(value)}" autocomplete="off"></div>`,
      actions: [{ label: 'Cancel', onClick: () => { done = true; res(null); } }, { label: cta, cls: 'primary', onClick: (ov) => { done = true; res($('#pb-in', ov).value.trim()); } }],
      onMount: (ov) => { const i = $('#pb-in', ov); i.select(); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.btn.primary', ov).click(); }); },
    });
    new MutationObserver((_, o) => { if (!document.body.contains(m.el)) { o.disconnect(); if (!done) res(null); } }).observe($('#modal-root'), { childList: true });
  });

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'success', 1800); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Copied', 'success', 1800); } catch { toast('Copy failed', 'error'); } t.remove(); }
}

// ---------- router ----------
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
function runCleanup() { state.cleanup.splice(0).forEach((f) => { try { f(); } catch { /* ignore */ } }); }

async function router() {
  runCleanup();
  const hash = location.hash.replace(/^#/, '') || '/';
  if (!state.user) {
    try { state.user = (await api('GET', '/auth/me')).user; } catch { state.user = null; }
  }
  if (!state.user) return renderAuth(hash === '/signup' ? 'signup' : 'login');
  if (hash === '/') { location.hash = '#/upload'; return; }
  if (hash === '/login' || hash === '/signup') { location.hash = '#/'; return; }
  for (const [re, fn] of routes) {
    const m = re.exec(hash);
    if (m) { try { await fn(...m.slice(1)); } catch (e) { if (e.status !== 401) viewError(e); } return; }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', router);

function viewError(e) {
  const c = $('#view');
  if (c) c.innerHTML = `<div class="card empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn" href="#/">Back to dashboard</a></div>`;
}

// ---------- auth ----------
async function renderAuth(mode) {
  if (!state.config) { try { state.config = await api('GET', '/config'); } catch { state.config = { allow_signup: true }; } }
  const signup = mode === 'signup';
  $('#app').innerHTML = `<div class="auth"><form class="auth-card" id="auth-form" novalidate>
    <div class="brand"><span class="logo">${I.logo}</span>FileLab</div>
    <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
    <p class="sub">${signup ? 'Host websites with real public URLs, free.' : 'Sign in to manage and deploy your websites.'}</p>
    <div id="auth-err"></div>
    ${signup ? '<div class="field"><label for="a-name">Name</label><input id="a-name" type="text" autocomplete="name"></div>' : ''}
    <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="a-pass">Password</label><input id="a-pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required>${signup ? '<span class="hint">At least 10 characters.</span>' : ''}</div>
    ${signup && state.config.invite_required ? '<div class="field"><label for="a-invite">Invite code</label><input id="a-invite" type="text" autocomplete="off"></div>' : ''}
    <button class="btn primary block" id="a-submit" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
    <p class="muted" style="margin-top:18px;text-align:center">${signup ? 'Already have an account? <a href="#/login">Sign in</a>' : (state.config.allow_signup ? 'New here? <a href="#/signup">Create an account</a>' : 'Sign-ups are disabled on this server.')}</p>
  </form></div>`;
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#a-submit'); btn.disabled = true; $('#auth-err').innerHTML = '';
    try {
      const payload = { email: $('#a-email').value, password: $('#a-pass').value };
      if (signup) { payload.name = $('#a-name').value; if ($('#a-invite')) payload.invite = $('#a-invite').value; }
      state.user = (await api('POST', signup ? '/auth/signup' : '/auth/login', { json: payload })).user;
      location.hash = '#/';
      router();
    } catch (err) { $('#auth-err').innerHTML = `<div class="err-box">${esc(err.message)}</div>`; btn.disabled = false; }
  });
}

// ---------- shell ----------
const NAV = [
  ['#/upload', 'upload', 'Upload Website'], ['#/sites', 'globe', 'My Websites'],
  ['#/deployments', 'rocket', 'Deployments'], ['#/storage', 'db', 'Hosting Storage'], ['#/domains', 'link', 'Domain Management'], ['#/usage', 'chart', 'Usage Statistics'], ['#/account', 'gear', 'Account'],
];
function shell(active, title, actionsHtml = '') {
  if (!$('#view')) {
    $('#app').innerHTML = `<div class="shell"><aside class="sidebar" id="sidebar">
      <div class="brand"><span class="logo">${I.logo}</span>FileLab</div>
      <nav class="nav">${NAV.map(([h, i, l]) => `<a href="${h}" data-nav="${h}">${ic(i)}${l}</a>`).join('')}</nav>
      <div class="side-bottom"><div class="user-chip"><div class="avatar">${esc((state.user.name || state.user.email)[0].toUpperCase())}</div>
        <div class="grow"><div class="trunc" style="font-weight:600">${esc(state.user.name || 'Account')}</div><div class="trunc muted" style="font-size:12px">${esc(state.user.email)}</div></div>
        <button class="iconbtn" id="logout" title="Sign out" aria-label="Sign out">${ic('out')}</button></div></div></aside>
      <div class="content"><header class="topbar"><button class="iconbtn menu-btn" id="menu" aria-label="Menu">${ic('menu')}</button><h1 id="page-title"></h1><div class="row right" id="top-actions"></div></header><main id="view"></main></div></div>`;
    $('#logout').onclick = async () => { await api('POST', '/auth/logout').catch(() => {}); state.user = null; location.hash = '#/login'; $('#app').innerHTML = ''; router(); };
    $('#menu').onclick = () => $('#sidebar').classList.toggle('open');
    $('#sidebar').addEventListener('click', (e) => { if (e.target.closest('a')) $('#sidebar').classList.remove('open'); });
  }
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  $('#page-title').textContent = title;
  $('#top-actions').innerHTML = actionsHtml;
  document.title = `${title} · FileLab`;
  return $('#view');
}

const siteBadge = (p) => (p.live ? '<span class="badge green live">Live</span>' : p.last_status === 'failed' ? '<span class="badge red">Failed</span>' : '<span class="badge gray">Not deployed</span>');
const depBadge = (d) => ({ ready: d.is_live ? '<span class="badge green live">Live</span>' : '<span class="badge blue">Ready</span>', failed: '<span class="badge red">Failed</span>', building: '<span class="badge amber live">Building</span>', queued: '<span class="badge amber live">Queued</span>' }[d.status] || `<span class="badge gray">${esc(d.status)}</span>`);

// ---------- dashboard ----------
route(/^\/$/, async () => {
  const v = shell('#/', 'Dashboard', `<a class="btn primary" href="#/upload">${ic('upload')}Upload website</a>`);
  v.innerHTML = '<div class="grid g-stats"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  const [ov, pj] = await Promise.all([api('GET', '/overview'), api('GET', '/projects')]);
  const c = ov.counts;
  const sites = pj.projects;
  v.innerHTML = `<div class="grid g-stats stagger">
      <div class="card stat"><div class="k">${ic('globe')}Websites</div><div class="v">${c.sites}</div></div>
      <div class="card stat"><div class="k">${ic('rocket')}Live now</div><div class="v">${c.live}</div></div>
      <div class="card stat"><div class="k">${ic('layers')}Deployments</div><div class="v">${c.deployments}</div></div>
      <div class="card stat"><div class="k">${ic('eye')}Page views <span class="faint">7d</span></div><div class="v">${c.views_7d}</div></div>
      <div class="card stat"><div class="k">${ic('db')}Storage used</div><div class="v">${fmtBytes(ov.storage.used)}</div></div></div>
    <div class="section-title"><h2>My Websites</h2><a class="right" href="#/sites">View all</a></div>
    ${sites.length ? `<div class="grid g-sites stagger">${sites.slice(0, 6).map(siteCard).join('')}</div>` : emptyState('globe', 'No websites yet', 'Drop in a website ZIP, folder, or files and FileLab will publish it for you.', `<div class="row"><a class="btn primary" href="#/upload">${ic('upload')}Upload website</a><a class="btn" href="#/upload">${ic('upload')}Upload</a></div>`)}
    <div class="section-title"><h2>Recent deployments</h2><a class="right" href="#/deployments">View all</a></div>
    ${deploymentsTable(ov.recent_deployments, true)}`;
  bindDeployRows(v);
});

function emptyState(icon, title, text, actions = '') {
  return `<div class="card empty"><div class="big">${ic(icon)}</div><h3>${esc(title)}</h3><p style="max-width:420px">${esc(text)}</p>${actions}</div>`;
}

function siteCard(p) {
  return `<div class="card hover site-card">
    <div class="top"><div class="site-ico">${esc(p.name[0].toUpperCase())}</div><div class="grow"><a href="#/site/${p.id}" style="color:var(--text);font-weight:650;font-size:15px" class="trunc" style="display:block">${esc(p.name)}</a>
      <a class="url trunc" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\//, ''))}</a></div>${siteBadge(p)}</div>
    <div class="meta"><span><b>${p.file_count ?? 0}</b> files</span><span><b>${fmtBytes(p.storage_bytes || 0)}</b></span><span>${ago(p.updated_at)}</span></div>
    <div class="row"><a class="btn sm" href="#/site/${p.id}">${ic('eye')}Manage</a><a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">${ic('ext')}Open</a></div>
  </div>`;
}

function deploymentsTable(deps, compact = false) {
  if (!deps || !deps.length) return emptyState('rocket', 'No deployments yet', 'Publish a website to see deployments here.');
  return `<div class="table-wrap"><table><thead><tr><th>Site</th><th>Status</th><th>When</th>${compact ? '' : '<th>Duration</th><th></th>'}</tr></thead><tbody>
    ${deps.map(d => `<tr data-dep="${d.id}"><td><a href="#/site/${d.project_id}">${esc(d.project_name || 'Site')}</a></td><td>${depBadge(d)}</td><td>${ago(d.created_at)}</td>${compact ? '' : `<td>${dur(d.started_at, d.finished_at)}</td><td><a class="btn sm" href="#/deployment/${d.id}">Details</a></td>`}</tr>`).join('')}
  </tbody></table></div>`;
}

function bindDeployRows(root) { /* placeholder */ }

// Additional routes and features from the original advanced dashboard are preserved here for future integration.
// The active dashboard served by server.js is the simpler public/app.js that matches the current MVP backend.
console.log('FileLab advanced dashboard module loaded (not active)');
