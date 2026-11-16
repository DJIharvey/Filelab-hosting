import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard loads the stylesheet and application script from public', async () => {
  const html = await read('public/index.html');
  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /id="toast-region"/);
});

test('dashboard selectors used by the login and site views have stylesheet rules', async () => {
  const [js, css] = await Promise.all([read('public/app.js'), read('public/styles.css')]);
  const classes = new Set([...js.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)));
  for (const name of classes) {
    assert.ok(css.includes(`.${name}`), `Missing CSS selector .${name}`);
  }
  assert.match(css, /#toast-region\s*\{/);
  assert.match(css, /\.toast\.success/);
  assert.match(css, /\.toast\.error/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test('frontend uses cookie sessions without browser-stored credentials or bearer auth', async () => {
  const js = await read('public/app.js');
  assert.match(js, /credentials:\s*'same-origin'/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.doesNotMatch(js, /Authorization\s*:|headers\.set\(['"]Authorization|Bearer\s/);
});

test('frontend login/logout and server endpoints match cookie session contract', async () => {
  const [js, server] = await Promise.all([read('public/app.js'), read('server.js')]);
  assert.match(js, /apiRequest\('\/api\/login',\s*\{\s*method:\s*'POST'/);
  assert.match(js, /async function login\(password\)[\s\S]*?return apiRequest\('\/api\/login'/);
  assert.doesNotMatch(js, /result\.token|state\.token/);
  assert.match(js, /apiRequest\('\/api\/logout',\s*\{\s*method:\s*'POST'/);
  assert.match(js, /apiRequest\('\/api\/sites'/);

  assert.match(server, /app\.post\("\/api\/login",\s*async\s*\(req,\s*res\)/);
  assert.match(server, /app\.post\("\/api\/logout"/);
  assert.match(server, /app\.get\("\/api\/sites",\s*admin/);
  assert.match(server, /app\.post\("\/api\/sites",\s*admin/);
  assert.match(server, /app\.post\("\/api\/sites\/:id\/deploy",\s*admin/);
});

test('server stores only random session token hashes and sets secure cookie attributes', async () => {
  const server = await read('server.js');
  assert.match(server, /crypto\.randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(server, /crypto\.createHash\("sha256"\)\.update\(token\)\.digest\("hex"\)/);
  assert.match(server, /token_hash:\s*hashSessionToken\(token\)/);
  assert.match(server, /filelab_admin_sessions/);
  assert.match(server, /SESSION_COOKIE\s*=\s*"filelab_session"/);
  assert.match(server, /\$\{SESSION_COOKIE\}=\$\{token\};\s*HttpOnly;\s*Secure;\s*SameSite=Lax;\s*Path=\//);
  assert.match(server, /SESSION_MAX_AGE_SECONDS\s*=\s*12\s*\*\s*60\s*\*\s*60/);
  assert.match(server, /\.is\("revoked_at",\s*null\)/);
  assert.match(server, /\.gt\("expires_at",\s*new Date\(\)\.toISOString\(\)\)/);
});

test('login response contains only ok and does not return the raw token', async () => {
  const server = await read('server.js');
  assert.match(server, /res\.json\(\{\s*ok:\s*true\s*\}\)/);
  assert.doesNotMatch(server, /res\.json\(\{[^}]*token\s*:/);
  assert.doesNotMatch(server, /res\.json\(\{[^}]*FILELAB_ADMIN_PASSWORD/);
});

test('frontend source does not include Supabase credentials or service-role key', async () => {
  const js = await read('public/app.js');
  assert.doesNotMatch(js, /SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i);
});

test('ZIP upload validates root index and deployment API contract remains intact', async () => {
  const [js, server] = await Promise.all([read('public/app.js'), read('server.js')]);
  assert.match(js, /rawName === 'index\.html'/);
  assert.match(js, /rootIndexFound/);
  assert.match(js, /JSON\.stringify\(payload\)/);
  assert.match(js, /`\/api\/sites\/\$\{siteId\}\/deploy`/);
  assert.match(server, /entries\.length > 1500/);
  assert.match(server, /total > 250 \* 1024 \* 1024/);
  assert.match(server, /safePath\(entry\.entryName\)/);
});

test('package manifest is valid JSON and includes installable runtime dependencies', async () => {
  const manifest = JSON.parse(await read('package.json'));
  assert.equal(manifest.scripts.start, 'node server.js');
  assert.equal(manifest.scripts.test, 'node --test');
  for (const dependency of ['express', 'helmet', 'adm-zip', 'mime-types', '@supabase/supabase-js']) {
    assert.ok(manifest.dependencies[dependency], `Missing dependency ${dependency}`);
  }
});
