const appRoot = document.getElementById('app');
const toastRoot = document.getElementById('toast-region');
const storageKey = 'filelab-admin-token';

const state = {
  token: localStorage.getItem(storageKey) || '',
  sites: []
};

const escapeHtml = (value) => {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
};

const formatBytes = (value) => {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
};

const showToast = (message, type = 'info') => {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastRoot.appendChild(el);
  window.setTimeout(() => {
    el.remove();
  }, 4200);
};

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = (payload && payload.error) || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload ?? {};
}

async function login(password) {
  const result = await apiRequest('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  if (!result.token) {
    throw new Error('Login succeeded but the server did not return a bearer token.');
  }

  state.token = result.token;
  localStorage.setItem(storageKey, state.token);
  return result;
}

async function logout() {
  state.token = '';
  localStorage.removeItem(storageKey);
  renderLogin();
  showToast('Signed out.', 'info');
}

async function loadSites() {
  const result = await apiRequest('/api/sites');
  state.sites = Array.isArray(result.sites) ? result.sites : [];
  renderDashboard();
}

async function createSite(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input[name="siteName"]');
  const name = (input.value || '').trim();
  if (!name) {
    showToast('Enter a website name first.', 'error');
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Creating…';

  try {
    await apiRequest('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    form.reset();
    showToast('Website created.', 'success');
    await loadSites();
  } catch (error) {
    showToast(error.message || 'Unable to create the website.', 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Create website';
  }
}

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function zipHasRootIndexHtml(file) {
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const view = new DataView(data);

  let eocdIndex = -1;
  const maxStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= maxStart; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdIndex = i;
      break;
    }
  }

  if (eocdIndex === -1) {
    throw new Error('This ZIP archive could not be read.');
  }

  const centralOffset = view.getUint32(eocdIndex + 16, true);
  const centralSize = view.getUint32(eocdIndex + 12, true);
  const entryCount = view.getUint16(eocdIndex + 10, true);

  let cursor = centralOffset;
  let rootIndexFound = false;
  let unsafePath = false;

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > bytes.length) {
      throw new Error('The ZIP archive is incomplete or corrupted.');
    }

    const sig = view.getUint32(cursor, true);
    if (sig !== 0x02014b50) {
      throw new Error('This ZIP archive is malformed.');
    }

    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    const nameBytes = bytes.slice(nameStart, nameEnd);
    const rawName = new TextDecoder().decode(nameBytes).replace(/\\/g, '/');

    if (!rawName || rawName.startsWith('/') || rawName.includes('..') || rawName.includes('\\')) {
      unsafePath = true;
    }

    if (rawName === 'index.html') {
      rootIndexFound = true;
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
    if (cursor > centralOffset + centralSize) {
      break;
    }
  }

  if (unsafePath) {
    throw new Error('This ZIP contains unsafe file paths, including absolute or traversal entries.');
  }

  if (!rootIndexFound) {
    throw new Error('The ZIP must include an index.html file at the root level.');
  }
}

async function deploySite(siteId, file) {
  if (!file) {
    throw new Error('Select a ZIP file to deploy.');
  }

  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Please upload a ZIP file.');
  }

  await zipHasRootIndexHtml(file);

  const payload = {
    zipBase64: bufferToBase64(await file.arrayBuffer())
  };

  return apiRequest(`/api/sites/${siteId}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function renderLogin() {
  appRoot.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="brand-row">
          <span class="brand-mark">F</span>
          <span>FileLab Hosting</span>
        </div>

        <h1>Admin sign in</h1>
        <p class="subtitle">Manage uploads, published sites, and deployment status.</p>

        <form id="login-form" class="auth-form">
          <label for="admin-password">Admin password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="Enter the admin password"
            required
          />
          <button type="submit" class="primary-btn">Sign in</button>
        </form>

        <div class="security-note">
          Recommended: host published websites on a separate public origin before launch so uploaded site JavaScript cannot access the admin dashboard origin.
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('admin-password').value;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Signing in…';

    try {
      await login(password);
      await loadSites();
    } catch (error) {
      showToast(error.message || 'Incorrect password.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Sign in';
    }
  });
}

function renderDashboard() {
  if (!state.token) {
    renderLogin();
    return;
  }

  const siteCards = state.sites.map((site) => {
    const url = `${window.location.origin}/s/${site.slug}/`;
    return `
      <article class="site-card">
        <div class="site-top">
          <div class="site-icon">${escapeHtml((site.name || 'S').slice(0, 1).toUpperCase())}</div>
          <div class="site-header-copy">
            <h3>${escapeHtml(site.name || 'Untitled site')}</h3>
            <a href="${url}" target="_blank" rel="noopener">${escapeHtml(url.replace(/^https?:\/\//, ''))}</a>
          </div>
        </div>

        <div class="site-meta">
          <span><strong>${site.file_count ?? 0}</strong> files</span>
          <span><strong>${formatBytes(site.total_bytes || 0)}</strong></span>
          <span><strong>${escapeHtml(site.status || 'draft')}</strong></span>
        </div>

        <div class="site-info-row">
          <span class="meta-label">Slug</span>
          <code>${escapeHtml(site.slug || 'site')}</code>
        </div>
        <div class="site-info-row">
          <span class="meta-label">Created</span>
          <span>${escapeHtml(formatDate(site.created_at))}</span>
        </div>

        <div class="site-actions">
          <button class="secondary-btn" type="button" data-open-url="${url}">Open site</button>
          <label class="upload-btn">
            <input type="file" accept=".zip,application/zip" data-site-id="${site.id}" />
            Upload ZIP
          </label>
        </div>
      </article>
    `;
  }).join('') || `
    <div class="empty-state">
      <h3>No websites yet</h3>
      <p>Create the first site and upload a ZIP containing an index.html file at the root.</p>
    </div>
  `;

  appRoot.innerHTML = `
    <div class="dashboard-shell">
      <header class="topbar">
        <div class="brand-row">
          <span class="brand-mark">F</span>
          <span>FileLab Hosting</span>
        </div>
        <button type="button" class="ghost-btn" id="logout-button">Sign out</button>
      </header>

      <main class="dashboard-content">
        <section class="card intro-card">
          <div>
            <p class="eyebrow">Website dashboard</p>
            <h2>Create and publish websites</h2>
          </div>
          <div class="security-note compact">
            Recommended: keep published sites on a dedicated public origin before launch.
          </div>
        </section>

        <section class="card create-card">
          <h3>Create website</h3>
          <form id="create-site-form" class="inline-form">
            <input name="siteName" type="text" maxlength="100" placeholder="My portfolio" aria-label="Website name" />
            <button type="submit" class="primary-btn">Create website</button>
          </form>
        </section>

        <section class="stats-grid">
          <article class="card stat-card">
            <span class="label">Websites</span>
            <strong>${state.sites.length}</strong>
          </article>
          <article class="card stat-card">
            <span class="label">Published</span>
            <strong>${state.sites.filter((site) => site.status === 'published').length}</strong>
          </article>
          <article class="card stat-card">
            <span class="label">Storage</span>
            <strong>${formatBytes(state.sites.reduce((total, site) => total + Number(site.total_bytes || 0), 0))}</strong>
          </article>
        </section>

        <section class="card sites-card">
          <div class="section-header">
            <h3>Published websites</h3>
          </div>
          <div class="site-grid">
            ${siteCards}
          </div>
        </section>
      </main>
    </div>
  `;

  document.getElementById('logout-button').addEventListener('click', logout);
  document.getElementById('create-site-form').addEventListener('submit', createSite);

  appRoot.querySelectorAll('[data-open-url]').forEach((button) => {
    button.addEventListener('click', () => {
      const url = button.getAttribute('data-open-url');
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  });

  appRoot.querySelectorAll('input[type="file"][data-site-id]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      const siteId = input.getAttribute('data-site-id');
      if (!file) return;

      input.disabled = true;
      input.value = '';

      try {
        const result = await deploySite(siteId, file);
        showToast(`${result.files || 0} files deployed to ${result.url || 'the site'}.`, 'success');
        await loadSites();
      } catch (error) {
        showToast(error.message || 'Deployment failed.', 'error');
      } finally {
        input.disabled = false;
      }
    });
  });
}

async function initialize() {
  if (!state.token) {
    renderLogin();
    return;
  }

  try {
    await loadSites();
  } catch (error) {
    showToast(error.message || 'Unable to load the dashboard.', 'error');
    state.token = '';
    localStorage.removeItem(storageKey);
    renderLogin();
  }
}

initialize();
