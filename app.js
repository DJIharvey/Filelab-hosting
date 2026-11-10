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
    <div class="meta"><span><b>${p.file_count ?? 0}</b> files</span><span><b>${fmtBytes(p.workspace_bytes || 0)}</b></span><span><b>${p.views_7d ?? 0}</b> views 7d</span></div>
    <div class="row gap-s"><a class="btn sm primary" href="#/site/${p.id}">Manage</a>
      ${p.live ? `<a class="btn sm ghost" href="${esc(p.url)}" target="_blank" rel="noopener">${ic('ext')}Visit</a>` : ''}<span class="faint right" style="font-size:12px">${ago(p.updated_at)}</span></div></div>`;
}

route(/^\/sites$/, async () => {
  const v = shell('#/sites', 'My Websites', `<a class="btn" href="#/upload">${ic('upload')}Upload</a><a class="btn primary" href="#/upload">${ic('upload')}Upload website</a>`);
  const { projects } = await api('GET', '/projects');
  v.innerHTML = projects.length ? `<div class="grid g-sites stagger">${projects.map(siteCard).join('')}</div>` : emptyState('globe', 'No websites yet', 'Upload a website ZIP, folder, or HTML file to get a public URL.', `<a class="btn primary" href="#/upload">${ic('upload')}Upload website</a>`);
});

// ---------- create / upload ----------
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
function urlPreview(slug) {
  return state.config?.sites_domain ? `https://${slug || 'your-name'}.${state.config.sites_domain}/` : `${location.origin}/s/${slug || 'your-name'}/`;
}

function nameFields() {
  return `<div class="field"><label for="n-name">Website name</label><input id="n-name" type="text" maxlength="60" placeholder="My portfolio" autocomplete="off"></div>
    <div class="field"><label for="n-slug">Project name (used in the URL)</label><input id="n-slug" type="text" maxlength="40" placeholder="my-portfolio" autocomplete="off" spellcheck="false">
    <span class="hint" id="n-url"></span></div>`;
}
function wireNameFields(root) {
  const name = $('#n-name', root), slug = $('#n-slug', root), out = $('#n-url', root);
  let touched = false;
  const upd = () => { out.textContent = urlPreview(slug.value); };
  name.addEventListener('input', () => { if (!touched) slug.value = slugify(name.value); upd(); });
  slug.addEventListener('input', () => { touched = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); upd(); });
  upd();
}


// Upload one or many File objects into a project. ZIPs are extracted server-side.
async function uploadFiles(projectId, fileList, { prefix = '', replace = false, onProgress } = {}) {
  const items = [...fileList];
  const rootHtml = items.find((f) => !f.webkitRelativePath && /\.html?$/i.test(f.name));
  const hasRootIndex = items.some((f) => (!f.webkitRelativePath || !f.webkitRelativePath.includes('/')) && /^index\.html?$/i.test(f.name));
  const res = { files: 0, zips: 0, errors: [] };
  let n = 0;
  for (const f of items) {
    onProgress && onProgress(n, items.length, f.name);
    try {
      if (/\.zip$/i.test(f.name) && items.length === 1 || (/\.zip$/i.test(f.name) && !f.webkitRelativePath)) {
        const q = new URLSearchParams({ ...(prefix ? { target: prefix } : {}), ...(replace ? { replace: '1' } : {}) });
        const r = await api('POST', `/projects/${projectId}/zip?${q}`, { body: f, headers: { 'content-type': 'application/zip' } });
        res.zips++; res.files += r.added; if (r.skipped?.length) res.errors.push(`Skipped: ${r.skipped.join(', ')}`);
      } else {
        let rel = f.webkitRelativePath || f.name;
        if (!f.webkitRelativePath && rootHtml === f && !hasRootIndex) rel = 'index.html';
        if (f.webkitRelativePath) rel = rel.split('/').slice(1).join('/') || f.name; // drop the picked folder's own name
        const p = (prefix ? prefix + '/' : '') + rel;
        await api('PUT', `/projects/${projectId}/file?path=${encodeURIComponent(p)}`, { body: f });
        res.files++;
      }
    } catch (e) { res.errors.push(`${f.name}: ${e.message}`); }
    n++;
  }
  onProgress && onProgress(n, items.length, '');
  return res;
}

function dropzone(onFiles, { label = 'Drop files here or <b>click to choose</b>', folder = false, accept = '', multiple = true } = {}) {
  const id = 'dz' + Math.random().toString(36).slice(2, 8);
  const html = `<div class="drop" id="${id}" tabindex="0" role="button"><div>${ic('upload')}</div><div>${label}</div><input type="file" ${multiple ? 'multiple' : ''} ${folder ? 'webkitdirectory' : ''} ${accept ? `accept="${accept}"` : ''} class="hide"></div>`;
  const mount = (root) => {
    const dz = $('#' + id, root), inp = $('input', dz);
    dz.addEventListener('click', () => inp.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', () => { if (inp.files.length) onFiles([...inp.files]); inp.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', async (e) => { const fs = await filesFromDrop(e.dataTransfer); if (fs.length) onFiles(fs); });
  };
  return { html, mount };
}

// supports dropping folders (webkitGetAsEntry) as well as plain files
async function filesFromDrop(dt) {
  const out = [];
  const walk = async (entry, base) => {
    if (entry.isFile) {
      const file = await new Promise((r, j) => entry.file(r, j));
      if (base) Object.defineProperty(file, 'webkitRelativePath', { value: base + file.name });
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do { batch = await new Promise((r, j) => reader.readEntries(r, j)); for (const e of batch) await walk(e, (base || '') + entry.name + '/' + ''); } while (batch.length);
    }
  };
  const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.length) {
    for (const en of entries) {
      if (en.isDirectory) {
        const sub = [];
        const readAll = async (dirEntry, base) => {
          const rd = dirEntry.createReader();
          let batch;
          do {
            batch = await new Promise((r, j) => rd.readEntries(r, j));
            for (const e of batch) {
              if (e.isFile) { const f = await new Promise((r, j) => e.file(r, j)); Object.defineProperty(f, 'webkitRelativePath', { value: base + e.name }); sub.push(f); }
              else await readAll(e, base + e.name + '/');
            }
          } while (batch.length);
        };
        await readAll(en, en.name + '/');
        out.push(...sub);
      } else await walk(en, '');
    }
    return out;
  }
  return [...dt.files];
}

route(/^\/upload$/, async () => {
  const v = shell('#/upload', 'Upload a Website');
  let picked = [];
  const dz = dropzone((fs) => { picked = fs; renderPicked(); }, {
    label: 'Drop your website ZIP, folder, or files here<br><span class="muted">or click to browse</span>',
    folder: false,
  });
  v.innerHTML = `<div class="col gap-l" style="max-width:820px;margin:0 auto">
    <div class="card" style="padding:clamp(22px,4vw,38px)">
      <div style="text-align:center;margin-bottom:22px"><div class="big" style="margin:0 auto 12px">${ic('upload')}</div>
        <h2 style="font-size:24px;margin-bottom:8px">Drop it. FileLab publishes it.</h2>
        <p class="muted">Upload a ready-made website. FileLab stores the files, publishes the site, and gives you a public link.</p></div>
      ${dz.html}
      <div class="row wrap" style="justify-content:center;margin-top:12px"><label class="btn sm" for="folder-in">${ic('folder')}Choose website folder</label><input id="folder-in" type="file" webkitdirectory class="hide"><span class="hint">ZIP, HTML, CSS, JavaScript, images and other site assets</span></div>
      <div id="picked" style="margin-top:16px"></div>
      <div id="up-prog" class="hide" style="margin-top:18px"><div class="bar"><i style="width:0"></i></div><div class="hint" id="up-label" style="margin-top:7px;text-align:center">Preparing upload…</div></div>
      <div id="up-err" style="margin-top:12px"></div>
      <button class="btn primary block" id="up-go" style="margin-top:18px" disabled>${ic('rocket')}Publish website</button>
    </div>
    <p class="hint" style="text-align:center">Your website stays online after publishing. Upload another version later to update it.</p>
  </div>`;
  dz.mount(v);
  const renderPicked = () => {
    const total = picked.reduce((n, f) => n + f.size, 0);
    $('#picked').innerHTML = picked.length ? `<div class="info-box"><b>${picked.length}</b> file${picked.length === 1 ? '' : 's'} ready · ${fmtBytes(total)}<div class="faint trunc" style="margin-top:4px">${esc(picked.slice(0, 5).map((f) => f.webkitRelativePath || f.name).join(', '))}${picked.length > 5 ? '…' : ''}</div></div>` : '';
    $('#up-go').disabled = !picked.length;
  };
  $('#folder-in').addEventListener('change', (e) => { picked = [...e.target.files]; renderPicked(); });
  $('#up-go').onclick = async () => {
    const btn = $('#up-go'); btn.disabled = true; $('#up-err').innerHTML = '';
    $('#up-prog').classList.remove('hide');
    let projectId = null;
    try {
      const firstPath = picked[0].webkitRelativePath || picked[0].name;
      let label = picked[0].webkitRelativePath ? firstPath.split('/')[0] : picked.length === 1 ? picked[0].name.replace(/\.zip$/i, '').replace(/\.[^.]+$/, '') : 'my-website';
      if (/^(index|home|main)$/i.test(label) || !label) label = 'my-website';
      const base = slugify(label) || 'my-website';
      let created;
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = attempt ? `${base.slice(0, 32)}-${Math.random().toString(36).slice(2, 6)}` : base;
        try { created = await api('POST', '/projects', { json: { name: label.slice(0, 60), slug } }); break; }
        catch (e) { if (e.status !== 409 || attempt === 4) throw e; }
      }
      projectId = created.project.id;
      const res = await uploadFiles(projectId, picked, {
        onProgress: (n, t, name) => { $('#up-prog .bar i').style.width = `${(n / t) * 100}%`; $('#up-label').textContent = name ? `Uploading ${name} (${n + 1} of ${t})` : 'Upload complete'; },
      });
      if (!res.files) throw new Error(res.errors[0] || 'No website files were uploaded.');
      if (res.errors.length) throw new Error(res.errors.join('\n'));
      $('#up-label').textContent = 'Publishing your website…';
      $('#up-prog .bar i').style.width = '100%';
      sessionStorage.setItem('autodeploy', projectId);
      location.hash = `#/site/${projectId}/overview`;
    } catch (err) {
      if (projectId) await api('DELETE', `/projects/${projectId}`).catch(() => {});
      $('#up-err').innerHTML = `<div class="err-box">${esc(err.message)}</div>`;
      btn.disabled = false;
      $('#up-label').textContent = 'Upload failed. You can try again.';
    }
  };
});

// ---------- deployments (global + helpers) ----------
function deploymentsTable(list, showProject) {
  if (!list.length) return emptyState('rocket', 'No deployments yet', 'Deploy a website and its history will show up here.');
  return `<div class="table-wrap"><table><thead><tr><th>Version</th>${showProject ? '<th>Website</th>' : ''}<th>Status</th><th>Files</th><th>Size</th><th>When</th><th></th></tr></thead><tbody>${list.map((d) => `<tr>
    <td><b>#${d.number}</b> ${d.note ? `<span class="faint">${esc(d.note)}</span>` : ''}</td>${showProject ? `<td><a href="#/site/${d.project_id}">${esc(d.project_name)}</a></td>` : ''}
    <td>${depBadge(d)}</td><td>${d.file_count || '—'}</td><td>${d.total_bytes ? fmtBytes(d.total_bytes) : '—'}</td><td class="muted">${ago(d.created_at)}${d.finished_at ? ` · ${dur(d.created_at, d.finished_at)}` : ''}</td>
    <td style="text-align:right"><button class="btn sm ghost" data-logs="${d.id}">Logs</button></td></tr>`).join('')}</tbody></table></div>`;
}
function bindDeployRows(root) { $$('[data-logs]', root).forEach((b) => (b.onclick = () => showDeployment(b.dataset.logs))); }

route(/^\/deployments$/, async () => {
  const v = shell('#/deployments', 'Deployments');
  const { deployments } = await api('GET', '/deployments');
  v.innerHTML = deploymentsTable(deployments, true);
  bindDeployRows(v);
});

function logsHtml(logs) { return logs.map((l) => `<div class="${l.level}"><span class="t">${clock(l.ts)}</span>${esc(l.message)}</div>`).join(''); }

// Shows a deployment's live progress + logs; resolves with the final deployment.
async function showDeployment(id, { onDone } = {}) {
  let closed = false;
  const m = modal({
    title: 'Deployment', wide: true,
    body: `<div id="dep-head" class="row" style="margin-bottom:12px"></div><div class="bar" id="dep-bar" style="margin-bottom:6px"><i style="width:0"></i></div><div class="hint" id="dep-sub" style="margin-bottom:12px"></div><div class="term" id="dep-logs"></div><div id="dep-url" style="margin-top:12px"></div>`,
    actions: [{ label: 'Close' }],
  });
  const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { closed = true; obs.disconnect(); } });
  obs.observe($('#modal-root'), { childList: true });
  let d;
  for (;;) {
    try { d = (await api('GET', `/deployments/${id}`)).deployment; } catch (e) { if (!closed) fail(e); return null; }
    if (closed) return d;
    $('#dep-head', m.el).innerHTML = `<h3>Version #${d.number}</h3>${depBadge(d)}<span class="muted right">${esc(d.project_name)}</span>`;
    const pct = d.status === 'ready' ? 100 : d.progress_total ? Math.round((d.progress_done / d.progress_total) * 90) + (d.status === 'building' ? 5 : 0) : 5;
    const bar = $('#dep-bar', m.el); bar.classList.toggle('indet', d.status === 'queued'); $('i', bar).style.width = `${d.status === 'failed' ? 100 : pct}%`;
    if (d.status === 'failed') $('i', bar).style.background = 'var(--red)';
    $('#dep-sub', m.el).textContent = d.status === 'ready' ? `Finished in ${dur(d.created_at, d.finished_at)} · ${d.file_count} files · ${fmtBytes(d.total_bytes)}` : d.status === 'failed' ? `Failed: ${d.error}` : `Verifying ${d.progress_done}/${d.progress_total} files…`;
    const term = $('#dep-logs', m.el); const atEnd = term.scrollTop + term.clientHeight >= term.scrollHeight - 30;
    term.innerHTML = logsHtml(d.logs || []); if (atEnd) term.scrollTop = term.scrollHeight;
    if (d.status === 'ready' || d.status === 'failed') break;
    await sleep(600);
  }
  if (d.status === 'ready' && d.is_live) {
    const p = (await api('GET', `/projects/${d.project_id}`)).project;
    $('#dep-url', m.el).innerHTML = `<div class="urlchip"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a><button class="iconbtn" data-copy="${esc(p.url)}" aria-label="Copy URL">${ic('copy')}</button><a class="iconbtn" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Open">${ic('ext')}</a></div>`;
    $('[data-copy]', m.el).onclick = (e) => copy(e.currentTarget.dataset.copy);
  }
  if (onDone) onDone(d);
  return d;
}

async function deploy(projectId, note = '') {
  let started;
  try { started = (await api('POST', `/projects/${projectId}/deployments`, { json: { note } })).deployment; } catch (e) { fail(e); return null; }
  return showDeployment(started.id);
}

// ---------- storage / domains / usage / account ----------
route(/^\/storage$/, async () => {
  const v = shell('#/storage', 'Hosting Storage');
  const s = await api('GET', '/storage');
  const max = Math.max(1, ...s.projects.map((p) => p.total_bytes));
  v.innerHTML = `<div class="grid g-stats" style="margin-bottom:20px"><div class="card stat"><div class="k">${ic('db')}Total stored</div><div class="v">${fmtBytes(s.used)}</div></div>
    <div class="card stat"><div class="k">Per-site limit</div><div class="v">${fmtBytes(s.quota_per_site)}</div></div><div class="card stat"><div class="k">Max file size</div><div class="v">${fmtBytes(s.max_file_bytes)}</div></div></div>
    ${s.projects.length ? `<div class="table-wrap"><table><thead><tr><th>Website</th><th style="width:34%">Usage (all versions)</th><th>Editable files</th><th>Total</th><th>Deployments</th><th></th></tr></thead><tbody>${s.projects.map((p) => `<tr>
      <td><a href="#/site/${p.id}">${esc(p.name)}</a></td><td><div class="bar"><i style="width:${Math.max(2, (p.total_bytes / s.quota_per_site) * 100)}%"></i></div></td>
      <td>${fmtBytes(p.workspace_bytes)}</td><td><b>${fmtBytes(p.total_bytes)}</b> <span class="faint">/ ${fmtBytes(s.quota_per_site)}</span></td><td>${p.deployments}</td>
      <td style="text-align:right"><button class="btn sm" data-gc="${p.id}">Clean up</button></td></tr>`).join('')}</tbody></table></div>
    <p class="hint" style="margin-top:10px">“Clean up” deletes stored file versions that no deployment or workspace file uses anymore. Deleting old deployments (Deployments tab of a website) frees space too.</p>` : emptyState('db', 'Nothing stored yet', 'Upload or generate a website to see storage here.')}`;
  $$('[data-gc]', v).forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { const r = await api('POST', `/projects/${b.dataset.gc}/gc`); toast(r.removed ? `Freed ${fmtBytes(r.freed)} (${r.removed} unused files)` : 'Nothing to clean up', 'success'); router(); } catch (e) { fail(e); b.disabled = false; }
  }));
});

function domainRow(d, withSite = true) {
  return `<tr><td><b>${esc(d.hostname)}</b></td>${withSite ? `<td><a href="#/site/${d.project_id}">${esc(d.project_name)}</a></td>` : ''}<td>${d.verified ? '<span class="badge green">Verified</span>' : '<span class="badge amber">Pending DNS</span>'}</td>
    <td class="wrapcell">${d.verified ? '<span class="muted">Serving the live deployment</span>' : `<div class="muted" style="margin-bottom:6px">Add this DNS TXT record, then verify:</div><div class="code"><span>${esc(d.txt_name)}</span><button class="iconbtn" data-copy="${esc(d.txt_name)}">${ic('copy')}</button></div><div class="code" style="margin-top:4px"><span>${esc(d.txt_value)}</span><button class="iconbtn" data-copy="${esc(d.txt_value)}">${ic('copy')}</button></div>`}</td>
    <td style="text-align:right;white-space:nowrap">${d.verified ? '' : `<button class="btn sm primary" data-verify="${d.id}">Verify</button> `}<button class="btn sm danger" data-rmdom="${d.id}">Remove</button></td></tr>`;
}
function bindDomains(root, reload) {
  $$('[data-copy]', root).forEach((b) => (b.onclick = () => copy(b.dataset.copy)));
  $$('[data-verify]', root).forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = 'Checking…';
    try { await api('POST', `/domains/${b.dataset.verify}/verify`); toast('Domain verified', 'success'); reload(); } catch (e) { fail(e); b.disabled = false; b.textContent = 'Verify'; }
  }));
  $$('[data-rmdom]', root).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Remove domain', 'Visitors to this domain will no longer see your website.', 'Remove'))) return;
    try { await api('DELETE', `/domains/${b.dataset.rmdom}`); reload(); } catch (e) { fail(e); }
  }));
}
const DOMAIN_HELP = `<div class="info-box"><b>How custom domains work.</b> 1) Add the domain, 2) create the TXT record shown to prove you own it, 3) click Verify, 4) point the domain at this Worker in Cloudflare (Workers → your worker → Settings → Domains &amp; Routes → Add → Custom domain, or a route on a zone in your account). See README “Custom domains”.</div>`;
async function addDomainDialog(projects, preselect, done) {
  modal({
    title: 'Add custom domain',
    body: `<div class="field"><label>Website</label><select id="dm-site">${projects.map((p) => `<option value="${p.id}" ${p.id === preselect ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>Domain</label><input id="dm-host" type="text" placeholder="www.example.com" autocomplete="off" spellcheck="false"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Add domain', cls: 'primary', onClick: async (ov) => { await api('POST', `/projects/${$('#dm-site', ov).value}/domains`, { json: { hostname: $('#dm-host', ov).value } }); toast('Domain added. Now verify DNS.', 'success'); done(); } }],
  });
}
route(/^\/domains$/, async () => {
  const v = shell('#/domains', 'Domain Management', '<button class="btn primary" id="add-dom">Add domain</button>');
  const [{ domains }, { projects }] = await Promise.all([api('GET', '/domains'), api('GET', '/projects')]);
  v.innerHTML = `<div class="col gap-l"><div class="card"><h3>Your platform URLs</h3><p class="muted" style="margin:6px 0 0">${state.config?.sites_domain ? `Every website is served at <span class="mono">https://&lt;project&gt;.${esc(state.config.sites_domain)}/</span>.` : `Every website is served at <span class="mono">${esc(location.origin)}/s/&lt;project&gt;/</span>. Set <span class="mono">SITES_DOMAIN</span> in wrangler.toml to use subdomains.`}</p></div>${DOMAIN_HELP}
    ${domains.length ? `<div class="table-wrap"><table><thead><tr><th>Domain</th><th>Website</th><th>Status</th><th>Details</th><th></th></tr></thead><tbody>${domains.map((d) => domainRow(d)).join('')}</tbody></table></div>` : emptyState('link', 'No custom domains', 'Connect your own domain to a website.')}</div>`;
  bindDomains(v, router);
  $('#add-dom').onclick = () => (projects.length ? addDomainDialog(projects, null, router) : toast('Create a website first.', 'error'));
});

route(/^\/usage$/, async () => {
  const v = shell('#/usage', 'Usage Statistics');
  const u = await api('GET', '/usage');
  const max = Math.max(1, ...u.totals);
  v.innerHTML = `<div class="grid g-2"><div class="card"><h3>Page views · last 14 days</h3><div class="bars">${u.totals.map((t, i) => `<div class="b" title="${u.days[i]}: ${t} views"><i style="height:${(t / max) * 100}%"></i><span>${u.days[i].slice(8)}</span></div>`).join('')}</div>
    <p class="hint" style="margin-top:8px">Counts HTML page loads served from your live deployments.</p></div>
</div>
    <div class="section-title"><h2>By website</h2></div>${u.projects.length ? `<div class="table-wrap"><table><thead><tr><th>Website</th><th>14-day views</th><th style="width:40%">Trend</th></tr></thead><tbody>${u.projects.map((p) => {
      const m = Math.max(1, ...p.series); return `<tr><td><a href="#/site/${p.id}">${esc(p.name)}</a></td><td><b>${p.total}</b></td><td><div class="bars" style="height:34px;gap:3px;padding:0">${p.series.map((s) => `<div class="b"><i style="height:${(s / m) * 100}%;max-width:100%"></i></div>`).join('')}</div></td></tr>`; }).join('')}</tbody></table></div>` : emptyState('chart', 'No websites yet', 'Statistics appear once your sites get visitors.')}`;
});

route(/^\/account$/, async () => {
  const v = shell('#/account', 'Project Settings');
  const [cfg, { projects }] = await Promise.all([api('GET', '/config'), api('GET', '/projects')]);
  state.config = cfg;
  v.innerHTML = `<div class="grid g-2"><div class="card"><h3>Account</h3><dl class="kv"><dt>Name</dt><dd>${esc(state.user.name || '—')}</dd><dt>Email</dt><dd>${esc(state.user.email)}</dd></dl></div>
    <div class="card"><h3>Platform limits</h3><dl class="kv"><dt>Max file size</dt><dd>${fmtBytes(cfg.limits.max_file_bytes)}</dd><dt>Max ZIP upload</dt><dd>${fmtBytes(cfg.limits.max_zip_bytes)}</dd><dt>Storage per site</dt><dd>${fmtBytes(cfg.limits.max_project_bytes)}</dd><dt>Files per site</dt><dd>${cfg.limits.max_files}</dd></dl></div></div>
    <div class="section-title"><h2>Website settings</h2></div>${projects.length ? `<div class="table-wrap"><table><thead><tr><th>Website</th><th>URL</th><th>Status</th><th></th></tr></thead><tbody>${projects.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\//, ''))}</a></td><td>${siteBadge(p)}</td><td style="text-align:right"><a class="btn sm" href="#/site/${p.id}/settings">Open settings</a></td></tr>`).join('')}</tbody></table></div>` : emptyState('gear', 'No websites yet', 'Per-website settings appear here.')}`;
});

// ---------- site detail ----------
const TABS = [['overview', 'rocket', 'Overview'], ['files', 'folder', 'Files'], ['preview', 'eye', 'Preview'], ['deployments', 'layers', 'Deployments'], ['domains', 'link', 'Domains'], ['settings', 'gear', 'Settings']];
const TEXT_EXT = /\.(html?|css|js|mjs|json|map|webmanifest|txt|md|csv|xml|svg|ya?ml|toml|ini|env|ts|tsx|jsx|vue|scss|sass|less|php)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg)$/i;

route(/^\/site\/(p_[0-9a-f]+)(?:\/([a-z]+))?$/, async (id, tab = 'overview') => {
  if (!TABS.some((t) => t[0] === tab)) tab = 'overview';
  const { project } = await api('GET', `/projects/${id}`);
  const v = shell('#/sites', project.name, `${project.live ? `<a class="btn" href="${esc(project.url)}" target="_blank" rel="noopener">${ic('ext')}Visit site</a>` : ''}<button class="btn primary" id="deploy-btn">${ic('rocket')}Deploy</button>`);
  v.innerHTML = `<div class="row wrap" style="margin-bottom:4px"><div class="urlchip"><a href="${esc(project.url)}" target="_blank" rel="noopener">${esc(project.url)}</a><button class="iconbtn" id="copy-url" aria-label="Copy URL">${ic('copy')}</button></div>${siteBadge(project)}${project.live ? `<span class="faint">version #${project.live_number ?? ''}</span>` : ''}</div>
    <nav class="tabs">${TABS.map(([k, i, l]) => `<a href="#/site/${id}/${k}" class="${k === tab ? 'active' : ''}">${ic(i)}${l}</a>`).join('')}</nav><div id="tab"></div>`;
  $('#copy-url').onclick = () => copy(project.url);
  $('#deploy-btn').onclick = async () => { const d = await deploy(id); if (d) router(); };
  const T = $('#tab');
  const ctx = { id, project, T, reload: router };
  ({ overview: tabOverview, files: tabFiles, preview: tabPreview, deployments: tabDeployments, domains: tabDomains, settings: tabSettings })[tab](ctx);
  if (tab === 'overview' && sessionStorage.getItem('autodeploy') === id) {
    sessionStorage.removeItem('autodeploy');
    const d = await deploy(id, 'Initial upload'); if (d) router();
  }
});

async function tabOverview({ id, project, T }) {
  const [files, deps] = await Promise.all([api('GET', `/projects/${id}/files`), api('GET', `/projects/${id}/deployments`)]);
  const real = files.files.filter((f) => !f.path.endsWith('.keep'));
  const bytes = real.reduce((n, f) => n + f.size, 0);
  const latest = deps.deployments[0];
  T.innerHTML = `<div class="grid g-stats" style="margin-bottom:18px"><div class="card stat"><div class="k">Status</div><div class="v" style="font-size:20px;margin-top:10px">${siteBadge(project)}</div></div>
    <div class="card stat"><div class="k">Files</div><div class="v">${real.length}</div></div><div class="card stat"><div class="k">Size</div><div class="v">${fmtBytes(bytes)}</div></div><div class="card stat"><div class="k">Deployments</div><div class="v">${deps.deployments.length}</div></div></div>
    <div class="grid g-2"><div class="card"><h3>Quick actions</h3><div class="col gap-s"><a class="btn" href="#/site/${id}/files">${ic('folder')}Open file manager</a><a class="btn" href="#/site/${id}/preview">${ic('eye')}Preview before deploying</a>
      <a class="btn" href="/api/projects/${id}/download">${ic('dl')}Download source code (.zip)</a></div></div>
    <div class="card"><h3>Latest deployment</h3>${latest ? `<div class="row" style="margin-bottom:8px"><b>#${latest.number}</b>${depBadge(latest)}<span class="muted right">${ago(latest.created_at)}</span></div>${latest.status === 'failed' ? `<div class="err-box">${esc(latest.error)}</div>` : `<div class="muted">${latest.file_count} files · ${fmtBytes(latest.total_bytes)}</div>`}<button class="btn sm" style="margin-top:10px" data-logs="${latest.id}">View logs</button>` : `<p class="muted">Not deployed yet. Press <b>Deploy</b> to publish this website to its public URL.</p>`}</div></div>`;
  bindDeployRows(T);
}

// ----- files tab -----
async function tabFiles({ id, T }) {
  const st = { files: [], cwd: '', sel: null, dirty: false, original: '', cache: null };
  T.innerHTML = `<div class="fm"><div class="fm-left"><div class="fm-bar"><button class="btn sm" id="f-new">${ic('plus')}File</button><button class="btn sm" id="f-dir">${ic('folder')}Folder</button><button class="btn sm" id="f-up">${ic('upload')}Upload</button><a class="btn sm ghost" href="/api/projects/${id}/download" title="Download all as ZIP">${ic('dl')}</a><input type="file" id="f-in" multiple class="hide"></div>
    <div class="crumbs" id="crumbs"></div><div class="flist" id="flist"></div></div><div class="fm-right" id="fm-right"></div></div>`;
  const list = $('#flist'), right = $('#fm-right');
  const rawUrl = (p) => `/api/projects/${id}/file?path=${encodeURIComponent(p)}`;

  const load = async () => { st.files = (await api('GET', `/projects/${id}/files`)).files; draw(); };
  const children = () => {
    const pre = st.cwd ? st.cwd + '/' : '';
    const dirs = new Map(), files = [];
    for (const f of st.files) {
      if (!f.path.startsWith(pre)) continue;
      const rest = f.path.slice(pre.length);
      const i = rest.indexOf('/');
      if (i >= 0) { const d = rest.slice(0, i); dirs.set(d, (dirs.get(d) || 0) + (rest.endsWith('.keep') && rest === d + '/.keep' ? 0 : 1)); }
      else if (rest !== '.keep') files.push(f);
    }
    return { dirs: [...dirs.keys()].sort().map((d) => ({ name: d, count: dirs.get(d) })), files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  };
  const draw = () => {
    const parts = st.cwd ? st.cwd.split('/') : [];
    $('#crumbs').innerHTML = `<a data-cd="">root</a>${parts.map((p, i) => `<span class="faint">/</span><a data-cd="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>`).join('')}`;
    const { dirs, files } = children();
    list.innerHTML = (st.cwd ? `<div class="fitem dir" data-cd="${esc(parts.slice(0, -1).join('/'))}">${ic('folder')}<span class="grow">..</span></div>` : '') +
      dirs.map((d) => `<div class="fitem dir" data-cd="${esc((st.cwd ? st.cwd + '/' : '') + d.name)}">${ic('folder')}<span class="grow trunc">${esc(d.name)}</span><span class="sz">${d.count} item${d.count === 1 ? '' : 's'}</span><span class="acts"><button class="iconbtn" data-ren-dir="${esc(d.name)}" title="Rename">${ic('edit')}</button><button class="iconbtn" data-del-dir="${esc(d.name)}" title="Delete">${ic('trash')}</button></span></div>`).join('') +
      files.map((f) => `<div class="fitem ${st.sel === f.path ? 'sel' : ''}" data-open="${esc(f.path)}">${ic(IMG_EXT.test(f.path) ? 'image' : /\.(html?|css|js)$/i.test(f.path) ? 'code' : 'file')}<span class="grow trunc">${esc(f.path.split('/').pop())}</span><span class="sz">${fmtBytes(f.size)}</span><span class="acts"><button class="iconbtn" data-ren="${esc(f.path)}" title="Rename">${ic('edit')}</button><button class="iconbtn" data-del="${esc(f.path)}" title="Delete">${ic('trash')}</button></span></div>`).join('') +
      (!dirs.length && !files.length ? `<div class="empty"><div>${st.files.length ? 'This folder is empty.' : 'No files yet. Upload a website folder, ZIP, or files to publish this site.'}</div></div>` : '');
    if (!st.sel) right.innerHTML = `<div class="empty" style="flex:1"><div class="big">${ic('code')}</div><h3>Select a file</h3><p>Open an HTML, CSS or JavaScript file to edit it, or an image to preview it.</p></div>`;
  };

  const guard = async () => (!st.dirty || (await confirmBox('Unsaved changes', 'You have unsaved changes in this file. Discard them?', 'Discard')));

  const openFile = async (path) => {
    if (!(await guard())) return;
    st.sel = path; st.dirty = false; draw();
    const f = st.files.find((x) => x.path === path);
    const head = (extra = '') => `<div class="editor-head"><b class="trunc grow" title="${esc(path)}">${esc(path)}</b><span class="faint">${fmtBytes(f.size)}</span>${extra}</div>`;
    if (IMG_EXT.test(path)) {
      right.innerHTML = head(`<a class="btn sm" href="${rawUrl(path)}&download=1">${ic('dl')}Download</a>`) + `<div class="imgprev"><img alt="${esc(path)}" src="${rawUrl(path)}"></div>`;
      return;
    }
    if (!TEXT_EXT.test(path) || f.size > 1048576) {
      right.innerHTML = head(`<a class="btn sm" href="${rawUrl(path)}&download=1">${ic('dl')}Download</a>`) + `<div class="empty" style="flex:1"><p>${f.size > 1048576 ? 'This file is too large to edit in the browser.' : 'This file type cannot be previewed.'}</p></div>`;
      return;
    }
    right.innerHTML = head() + '<div class="empty" style="flex:1"><div class="spinner"></div></div>';
    let text;
    try { const r = await fetch(rawUrl(path), { credentials: 'same-origin' }); if (!r.ok) throw new Error('Could not load file'); text = await r.text(); } catch (e) { fail(e); return; }
    if (st.sel !== path) return;
    st.original = text;
    right.innerHTML = head(`<span class="badge amber hide" id="dirty">Unsaved</span><button class="btn sm primary" id="save" disabled>${ic('check')}Save</button>`) +
      `<div class="ed"><pre class="ln" id="ln"></pre><textarea id="code" spellcheck="false" wrap="off" aria-label="Editor for ${esc(path)}"></textarea></div>`;
    const ta = $('#code'), ln = $('#ln');
    ta.value = text;
    const lines = () => { ln.textContent = Array.from({ length: ta.value.split('\n').length }, (_, i) => i + 1).join('\n'); };
    lines();
    ta.addEventListener('scroll', () => { ln.scrollTop = ta.scrollTop; });
    ta.addEventListener('input', () => { st.dirty = ta.value !== st.original; $('#dirty').classList.toggle('hide', !st.dirty); $('#save').disabled = !st.dirty; lines(); });
    const save = async () => {
      if (!st.dirty) return;
      const b = $('#save'); b.disabled = true;
      try { await api('PUT', `/projects/${id}/file?path=${encodeURIComponent(path)}`, { body: ta.value }); st.original = ta.value; st.dirty = false; $('#dirty').classList.add('hide'); toast('Saved', 'success', 1500); await load(); }
      catch (e) { fail(e); b.disabled = false; }
    };
    $('#save').onclick = save;
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  };

  const warnUnload = (e) => { if (st.dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warnUnload); state.cleanup.push(() => window.removeEventListener('beforeunload', warnUnload));

  T.addEventListener('click', async (e) => {
    const t = e.target;
    const cd = t.closest('[data-cd]'); if (cd && !t.closest('.acts')) { st.cwd = cd.dataset.cd; draw(); return; }
    const ren = t.closest('[data-ren]'), del = t.closest('[data-del]'), rd = t.closest('[data-ren-dir]'), dd = t.closest('[data-del-dir]');
    try {
      if (ren) {
        const to = await promptBox('Rename file', 'New path', ren.dataset.ren); if (!to || to === ren.dataset.ren) return;
        await api('POST', `/projects/${id}/files/rename`, { json: { from: ren.dataset.ren, to } }); if (st.sel === ren.dataset.ren) { st.sel = null; st.dirty = false; } await load(); toast('Renamed', 'success'); return;
      }
      if (del) {
        if (!(await confirmBox('Delete file', `Delete <b>${esc(del.dataset.del)}</b>? This cannot be undone.`, 'Delete'))) return;
        await api('POST', `/projects/${id}/files/delete`, { json: { path: del.dataset.del } }); if (st.sel === del.dataset.del) { st.sel = null; st.dirty = false; } await load(); toast('Deleted', 'success'); return;
      }
      if (rd) {
        const base = (st.cwd ? st.cwd + '/' : '') + rd.dataset.renDir;
        const to = await promptBox('Rename folder', 'New path', base); if (!to || to === base) return;
        await api('POST', `/projects/${id}/files/rename`, { json: { from: base, to, folder: true } }); st.sel = null; st.dirty = false; await load(); toast('Renamed', 'success'); return;
      }
      if (dd) {
        const base = (st.cwd ? st.cwd + '/' : '') + dd.dataset.delDir;
        if (!(await confirmBox('Delete folder', `Delete <b>${esc(base)}</b> and everything inside it?`, 'Delete'))) return;
        await api('POST', `/projects/${id}/files/delete`, { json: { path: base, folder: true } }); st.sel = null; st.dirty = false; await load(); toast('Deleted', 'success'); return;
      }
      const op = t.closest('[data-open]'); if (op) return openFile(op.dataset.open);
    } catch (err) { fail(err); }
  });

  $('#f-new').onclick = async () => {
    const name = await promptBox('New file', 'File name (folders allowed, e.g. css/theme.css)', (st.cwd ? st.cwd + '/' : '') + 'new-file.html', 'Create'); if (!name) return;
    try { await api('PUT', `/projects/${id}/file?path=${encodeURIComponent(name)}`, { body: '' }); await load(); await openFile(name); } catch (e) { fail(e); }
  };
  $('#f-dir').onclick = async () => {
    const name = await promptBox('New folder', 'Folder name', (st.cwd ? st.cwd + '/' : '') + 'new-folder', 'Create'); if (!name) return;
    try { await api('POST', `/projects/${id}/files/mkdir`, { json: { path: name } }); await load(); } catch (e) { fail(e); }
  };
  $('#f-up').onclick = () => {
    const z = dropzone((fs) => run(fs), { label: 'Drop files, a folder or a <b>ZIP</b> here (or click)' });
    const run = async (fs) => {
      $('#up-status').innerHTML = '<div class="bar indet"><i></i></div>';
      const r = await uploadFiles(id, fs, { prefix: st.cwd, replace: $('#zip-replace').checked, onProgress: (n, t, name) => { $('#up-status').innerHTML = `<div class="hint">${name ? `Uploading ${esc(name)} (${n + 1}/${t})` : 'Done'}</div>`; } });
      await load();
      if (r.errors.length) { $('#up-status').innerHTML = `<div class="err-box">${r.errors.map(esc).join('<br>')}</div>`; if (!r.files) return; }
      toast(`Uploaded ${r.files} file${r.files === 1 ? '' : 's'}${r.zips ? ' (ZIP extracted)' : ''}`, 'success'); if (!r.errors.length) mm.close();
    };
    const mm = modal({ title: `Upload${st.cwd ? ' to ' + st.cwd : ''}`, body: `${z.html}<div class="row" style="margin-top:10px"><label class="btn sm" for="fold">${ic('folder')}Choose a folder</label><input type="file" id="fold" webkitdirectory class="hide"></div>
      <label class="row gap-s" style="margin-top:12px"><span class="switch"><input type="checkbox" id="zip-replace"><i></i></span><span class="muted">For ZIPs: delete files that are not in the ZIP</span></label><div id="up-status" style="margin-top:12px"></div>`, actions: [{ label: 'Close' }] });
    z.mount(mm.el); $('#fold', mm.el).addEventListener('change', (e) => run([...e.target.files]));
  };

  await load();
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('open')) openFile(qs.get('open'));
}

// ----- preview tab -----
async function tabPreview({ id, project, T }) {
  let device = 'desktop', source = 'workspace', base = '';
  T.innerHTML = `<div class="pv-bar"><div class="seg" id="pv-dev"><button data-d="desktop" class="on">${ic('desktop')}Desktop</button><button data-d="tablet">${ic('tablet')}Tablet</button><button data-d="mobile">${ic('phone')}Mobile</button></div>
    <div class="seg" id="pv-src"><button data-s="workspace" class="on">Draft (not deployed)</button><button data-s="live" ${project.live ? '' : 'disabled title="Deploy first"'}>Live site</button></div>
    <input type="text" id="pv-path" value="/" style="width:200px" aria-label="Page path" spellcheck="false"><button class="btn" id="pv-go">Go</button><button class="btn" id="pv-refresh">${ic('refresh')}Refresh</button><button class="btn" id="pv-open">${ic('ext')}Open in new tab</button></div>
    <div class="pv-stage"><iframe class="pv-frame" id="pv-frame" title="Website preview" sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe></div>
    <p class="hint" style="margin-top:8px" id="pv-hint"></p>`;
  const frame = $('#pv-frame');
  const url = () => {
    const p = ($('#pv-path').value || '/').replace(/^\/?/, '/');
    return (source === 'live' ? project.url.replace(/\/$/, '') : base.replace(/\/$/, '')) + p;
  };
  const token = async () => { base = (await api('POST', `/projects/${id}/preview-token`)).path; };
  const load = async () => {
    if (source === 'workspace') await token();
    frame.src = url() + (url().includes('?') ? '&' : '?') + '_r=' + Date.now();
    $('#pv-hint').textContent = source === 'workspace' ? 'Showing your current files, including changes you have not deployed yet. The link is private and expires in 1 hour.' : 'Showing exactly what visitors see at your public URL.';
  };
  $('#pv-dev').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; device = b.dataset.d; $$('#pv-dev button').forEach((x) => x.classList.toggle('on', x === b)); frame.className = 'pv-frame ' + device; });
  $('#pv-src').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; source = b.dataset.s; $$('#pv-src button').forEach((x) => x.classList.toggle('on', x === b)); load().catch(fail); });
  $('#pv-refresh').onclick = () => load().catch(fail); $('#pv-go').onclick = () => load().catch(fail);
  $('#pv-path').addEventListener('keydown', (e) => { if (e.key === 'Enter') load().catch(fail); });
  $('#pv-open').onclick = () => window.open(url(), '_blank', 'noopener');
  load().catch(fail);
}

// ----- deployments tab -----
async function tabDeployments({ id, T }) {
  const { deployments, url } = await api('GET', `/projects/${id}/deployments`);
  if (!deployments.length) { T.innerHTML = emptyState('rocket', 'No deployments yet', 'Press Deploy to publish this website to ' + url); return; }
  T.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Files</th><th>Size</th><th>When</th><th></th></tr></thead><tbody>${deployments.map((d) => `<tr>
    <td><b>#${d.number}</b> ${d.note ? `<span class="faint">${esc(d.note)}</span>` : ''}</td><td>${depBadge(d)}</td><td>${d.file_count || '—'}</td><td>${d.total_bytes ? fmtBytes(d.total_bytes) : '—'}</td><td class="muted">${ago(d.created_at)} · ${dur(d.created_at, d.finished_at)}</td>
    <td style="text-align:right;white-space:nowrap"><button class="btn sm ghost" data-logs="${d.id}">Logs</button>
    ${d.status === 'ready' && !d.is_live ? `<button class="btn sm" data-promote="${d.id}" data-n="${d.number}">${ic('undo')}Make live</button> ` : ''}
    ${d.status === 'ready' ? `<button class="btn sm ghost" data-restore="${d.id}" data-n="${d.number}" title="Copy this version's files into the editor">Restore files</button>` : ''}
    ${!d.is_live ? `<button class="iconbtn" data-rm="${d.id}" title="Delete deployment" aria-label="Delete deployment">${ic('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint" style="margin-top:10px"><b>Make live</b> switches the public URL to that exact snapshot instantly (rollback). <b>Restore files</b> copies a snapshot back into the file manager so you can keep editing from it.</p>`;
  bindDeployRows(T);
  T.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.promote) { if (!(await confirmBox(`Make version #${b.dataset.n} live?`, 'The public URL will immediately serve this version.', 'Make live', false))) return; await api('POST', `/deployments/${b.dataset.promote}/promote`); toast(`Version #${b.dataset.n} is live`, 'success'); router(); }
      else if (b.dataset.restore) { if (!(await confirmBox(`Restore version #${b.dataset.n}?`, 'Your current editable files will be replaced by this version. The live site is not changed until you deploy.', 'Restore'))) return; await api('POST', `/deployments/${b.dataset.restore}/restore`); toast('Files restored to the editor', 'success'); }
      else if (b.dataset.rm) { if (!(await confirmBox('Delete deployment', 'This removes the deployment record and logs.', 'Delete'))) return; await api('DELETE', `/deployments/${b.dataset.rm}`); router(); }
    } catch (err) { fail(err); }
  });
}

// ----- domains tab -----
async function tabDomains({ id, T }) {
  const { domains } = await api('GET', '/domains');
  const mine = domains.filter((d) => d.project_id === id);
  T.innerHTML = `<div class="col gap-l"><div class="row"><h3>Custom domains</h3><button class="btn primary right" id="dm-add">Add domain</button></div>${DOMAIN_HELP}
    ${mine.length ? `<div class="table-wrap"><table><thead><tr><th>Domain</th><th>Status</th><th>Details</th><th></th></tr></thead><tbody>${mine.map((d) => domainRow(d, false)).join('')}</tbody></table></div>` : emptyState('link', 'No custom domains', 'Connect your own domain, like www.yourname.com.')}</div>`;
  bindDomains(T, router);
  $('#dm-add').onclick = () => addDomainDialog([{ id, name: $('#page-title').textContent }], id, router);
}

// ----- settings tab -----
async function tabSettings({ id, project, T }) {
  T.innerHTML = `<div class="grid g-2"><form class="card" id="set-form"><h3>General</h3><div class="field"><label for="s-name">Website name</label><input id="s-name" type="text" maxlength="60" value="${esc(project.name)}"></div>
    <div class="field"><label for="s-desc">Description</label><input id="s-desc" type="text" maxlength="300" value="${esc(project.description)}"></div>
    <div class="field"><label>Public URL</label><div class="code"><span>${esc(project.url)}</span></div><span class="hint">The URL name “${esc(project.slug)}” is permanent so links never break. Updating the site never changes it.</span></div>
    <label class="row gap-s" style="margin-bottom:16px"><span class="switch"><input type="checkbox" id="s-spa" ${project.spa_fallback ? 'checked' : ''}><i></i></span><span>Single-page app mode <span class="hint">(unknown paths serve index.html)</span></span></label>
    <button class="btn primary" type="submit">Save settings</button></form>
    <div class="col"><div class="card"><h3>Source code</h3><p class="muted" style="margin-bottom:12px">Download every file in this website's workspace as a ZIP.</p><a class="btn" href="/api/projects/${id}/download">${ic('dl')}Download source (.zip)</a></div>
    <div class="card" style="border-color:rgba(248,113,113,.3)"><h3 style="color:#fca5a5">Danger zone</h3><p class="muted" style="margin-bottom:12px">Deleting removes the website, all files, deployments and its URL permanently.</p><button class="btn danger" id="del-site">${ic('trash')}Delete website</button></div></div></div>`;
  $('#set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('PATCH', `/projects/${id}`, { json: { name: $('#s-name').value, description: $('#s-desc').value, spa_fallback: $('#s-spa').checked } }); toast('Settings saved', 'success'); router(); } catch (err) { fail(err); }
  });
  $('#del-site').onclick = async () => {
    const typed = await promptBox('Delete website', `Type “${project.slug}” to confirm permanent deletion`, '', 'Delete forever');
    if (typed !== project.slug) { if (typed !== null) toast('Name did not match.', 'error'); return; }
    try { await api('DELETE', `/projects/${id}`); toast('Website deleted', 'success'); location.hash = '#/sites'; } catch (err) { fail(err); }
  };
}

// ---------- boot ----------
router();
