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

test('frontend endpoint, methods, auth header and request fields match server routes', async () => {
  const [js, server] = await Promise.all([read('public/app.js'), read('server.js')]);
  assert.match(server, /app\.post\("\/api\/login"/);
  assert.match(server, /app\.get\("\/api\/sites"/);
  assert.match(server, /app\.post\("\/api\/sites"/);
  assert.match(server, /app\.post\("\/api\/sites\/\:id\/deploy"/);
  assert.match(js, /apiRequest\('\/api\/login'/);
  assert.match(js, /apiRequest\('\/api\/sites'/);
  assert.match(js, /Authorization', `Bearer \$\{state\.token\}`/);
  assert.match(js, /JSON\.stringify\(\{ password \}\)/);
  assert.match(js, /JSON\.stringify\(\{ name \}\)/);
  assert.match(js, /zipBase64:/);
  assert.match(js, /`\/api\/sites\/\$\{siteId\}\/deploy`/);
});

test('frontend source does not include Supabase credentials or service-role key', async () => {
  const js = await read('public/app.js');
  assert.doesNotMatch(js, /SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i);
});

test('deployment validates root index and bounds archive entries before posting', async () => {
  const js = await read('public/app.js');
  const server = await read('server.js');
  assert.match(js, /rawName === 'index\.html'/);
  assert.match(js, /rootIndexFound/);
  assert.match(server, /entries\.length>1500/);
  assert.match(server, /250\*1024\*1024/);
  assert.match(server, /safePath\(e\.entryName\)/);
});

test('package manifest is valid JSON and includes installable runtime dependencies', async () => {
  const manifest = JSON.parse(await read('package.json'));
  assert.equal(manifest.scripts.start, 'node server.js');
  assert.equal(manifest.scripts.test, 'node --test');
  for (const dependency of ['express', 'helmet', 'adm-zip', 'mime-types', '@supabase/supabase-js']) {
    assert.ok(manifest.dependencies[dependency], `Missing dependency ${dependency}`);
  }
});
