import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createAdminApp, safeZipPath, sessions, loginLimiter, deployLimiter } from "../server.js";
import { createPublicApp, safePublicPath } from "../public-server.js";
import http from "node:http";
import AdmZip from "adm-zip";

process.env.FILELAB_ADMIN_PASSWORD = "test-admin-password-123";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.PUBLIC_SITE_ORIGIN = "http://public.example";

function makeAdminMock() {
  const sites = new Map();
  const files = new Map();
  const storage = new Map();
  let uploadFail = false;

  function chain(table, state = { filters: {} }) {
    const c = {
      select() { return c; },
      eq(col, val) { state.filters[col] = val; return c; },
      order() { return c; },
      async single() {
        if (table === "filelab_sites") {
          for (const s of sites.values()) {
            if (state.filters.id && s.id === state.filters.id) return { data: s, error: null };
            if (state.filters.slug && s.slug === state.filters.slug) return { data: s, error: null };
          }
          return { data: null, error: { message: "not found" } };
        }
        return { data: null, error: null };
      },
      async maybeSingle() { return { data: null, error: null }; },
      async insert(rows) {
        if (table === "filelab_sites") {
          const row = Array.isArray(rows) ? rows[0] : rows;
          sites.set(row.id || "newid", row);
          return { data: row, error: null, select() { return { single: async () => ({ data: row, error: null }) }; } };
        }
        if (table === "filelab_site_files") {
          const arr = Array.isArray(rows) ? rows : [rows];
          for (const r of arr) {
            if (!files.has(r.site_id)) files.set(r.site_id, new Map());
            files.get(r.site_id).set(r.path, r);
          }
          return { error: null };
        }
        return { error: null };
      },
      update(obj) {
        state.pendingUpdate = obj;
        return c;
      },
      delete() { return c; },
      async then(resolve) {
        if (state.pendingUpdate && table === "filelab_sites" && state.filters.id) {
          const s = sites.get(state.filters.id);
          if (s) Object.assign(s, state.pendingUpdate);
        }
        if (table === "filelab_site_files" && state.filters.site_id && !state.pendingUpdate) {
          files.delete(state.filters.site_id);
        }
        resolve({ error: null });
      }
    };
    return c;
  }

  return {
    sites, files, storage,
    setUploadFail(v) { uploadFail = v; },
    db: {
      from(table) { return chain(table); },
      storage: {
        from() {
          return {
            async upload(key, data) {
              if (uploadFail) return { error: { message: "forced fail" } };
              storage.set(key, data);
              return { error: null };
            },
            async remove(keys) {
              for (const k of keys) storage.delete(k);
              return { error: null };
            },
            async download(key) {
              if (!storage.has(key)) return { data: null, error: { message: "missing" } };
              return { data: { arrayBuffer: async () => storage.get(key) }, error: null };
            }
          };
        }
      }
    },
    addSite(id, slug, status = "published", prefix = `sites/${id}`) {
      sites.set(id, { id, slug, status, storage_prefix: prefix, name: slug });
    },
    addFile(siteId, path, content) {
      if (!files.has(siteId)) files.set(siteId, new Map());
      files.get(siteId).set(path, { path, content_type: "text/html", size_bytes: content.length });
      const site = sites.get(siteId);
      if (site) storage.set(site.storage_prefix + "/" + path, Buffer.from(content));
    }
  };
}

function request(app, path, { method = "GET", body, headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, async () => {
      const port = server.address().port;
      const opts = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: { ...headers }
      };
      if (cookie) opts.headers.cookie = cookie;
      const req = http.request(opts, res => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode, headers: res.headers, text: data, setCookie: res.headers["set-cookie"] });
        });
      });
      req.on("error", e => { server.close(); reject(e); });
      if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
      req.end();
    });
  });
}

function makeZip(files) {
  const z = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    z.addFile(name, Buffer.from(content));
  }
  return z.toBuffer();
}

describe("safeZipPath", () => {
  test("accepts normal", () => {
    assert.equal(safeZipPath("index.html"), "index.html");
    assert.equal(safeZipPath("css/app.css"), "css/app.css");
  });
  test("rejects traversal and dangerous", () => {
    assert.equal(safeZipPath("../secret"), null);
    assert.equal(safeZipPath("foo/../../bar"), null);
    assert.equal(safeZipPath("%2e%2e/etc"), null);
    assert.equal(safeZipPath("a\0b"), null);
  });
});

describe("admin sessions", () => {
  test("login creates session cookie, not password token", async () => {
    const mock = makeAdminMock();
    const app = createAdminApp(mock.db);
    const res = await request(app, "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body: { password: "test-admin-password-123" }
    });
    assert.equal(res.status, 200);
    assert.match(res.text, /"ok":true/);
    assert.ok(res.setCookie);
    assert.match(String(res.setCookie), /filelab_session=/);
    assert.doesNotMatch(String(res.setCookie), /test-admin-password/);
  });

  test("unauthorized access rejected", async () => {
    const mock = makeAdminMock();
    const app = createAdminApp(mock.db);
    const res = await request(app, "/api/sites");
    assert.equal(res.status, 401);
  });

  test("logout revokes session", async () => {
    const mock = makeAdminMock();
    const app = createAdminApp(mock.db);
    const login = await request(app, "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body: { password: "test-admin-password-123" }
    });
    const raw = Array.isArray(login.setCookie) ? login.setCookie[0] : String(login.setCookie);
    const cookie = raw.split(";")[0];
    const out = await request(app, "/api/logout", {
      method: "POST",
      cookie,
      headers: { origin: "http://127.0.0.1", "x-filelab-request": "1" }
    });
    assert.equal(out.status, 200);
    const after = await request(app, "/api/sites", { cookie });
    assert.equal(after.status, 401);
  });

  test("CSRF blocks missing origin/header", async () => {
    const mock = makeAdminMock();
    const app = createAdminApp(mock.db);
    const login = await request(app, "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body: { password: "test-admin-password-123" }
    });
    const raw = Array.isArray(login.setCookie) ? login.setCookie[0] : String(login.setCookie);
    const cookie = raw.split(";")[0];
    const res = await request(app, "/api/sites", {
      method: "POST",
      cookie,
      headers: { "content-type": "application/json" },
      body: { name: "x" }
    });
    assert.equal(res.status, 403);
  });
});

describe("rate limiting", () => {
  test("login rate limit returns 429", async () => {
    const mock = makeAdminMock();
    const app = createAdminApp(mock.db);
    let last;
    for (let i = 0; i < 7; i++) {
      last = await request(app, "/api/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
        body: { password: "wrong" }
      });
    }
    assert.equal(last.status, 429);
  });
});

describe("deploy safety", () => {
  test.beforeEach(() => { loginLimiter.reset(); deployLimiter.reset(); });

  test("duplicate paths rejected", async () => {
    const mock = makeAdminMock();
    mock.addSite("s1", "mysite", "draft");
    const app = createAdminApp(mock.db);
    const login = await request(app, "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body: { password: "test-admin-password-123" }
    });
    const raw = Array.isArray(login.setCookie) ? login.setCookie[0] : String(login.setCookie);
    const cookie = raw.split(";")[0];
    const zip = makeZip({ "index.html": "<h1>a</h1>", "dup.html": "<h1>b</h1>" });
    const res = await request(app, "/api/sites/s1/deploy", {
      method: "POST",
      cookie,
      headers: { "content-type": "application/json", origin: "http://127.0.0.1", "x-filelab-request": "1" },
      body: { zipBase64: zip.toString("base64") }
    });
    assert.ok([200, 400].includes(res.status));
  });

  test("failed upload preserves previous version", async () => {
    const mock = makeAdminMock();
    mock.addSite("s1", "mysite", "published", "sites/s1/old");
    mock.addFile("s1", "index.html", "<h1>old</h1>");
    mock.setUploadFail(true);
    const app = createAdminApp(mock.db);
    const login = await request(app, "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
      body: { password: "test-admin-password-123" }
    });
    const raw = Array.isArray(login.setCookie) ? login.setCookie[0] : String(login.setCookie);
    const cookie = raw.split(";")[0];
    const zip = makeZip({ "index.html": "<h1>new</h1>" });
    const res = await request(app, "/api/sites/s1/deploy", {
      method: "POST",
      cookie,
      headers: { "content-type": "application/json", origin: "http://127.0.0.1", "x-filelab-request": "1" },
      body: { zipBase64: zip.toString("base64") }
    });
    assert.equal(res.status, 502);
    const site = mock.sites.get("s1");
    assert.equal(site.storage_prefix, "sites/s1/old");
    assert.equal(site.status, "published");
  });
});

describe("public service remains read-only", () => {
  test("no admin or write endpoints", async () => {
    const app = createPublicApp({ from() { return { select() { return this; }, eq() { return this; }, single: async () => ({ data: null, error: {} }), maybeSingle: async () => ({ data: null }) }; }, storage: { from() { return { download: async () => ({ data: null, error: {} }) }; } } });
    const res = await request(app, "/api/sites", { method: "POST" });
    assert.equal(res.status, 404);
  });

  test("safePublicPath still rejects traversal", () => {
    assert.equal(safePublicPath("../etc"), null);
    assert.equal(safePublicPath("%2e%2e/secret"), null);
  });
});

describe("no secrets in frontend", () => {
  test("public assets do not contain service role key", async () => {
    const fs = await import("node:fs/promises");
    const appJs = await fs.readFile("public/app.js", "utf8");
    const index = await fs.readFile("public/index.html", "utf8");
    assert.doesNotMatch(appJs, /SERVICE_ROLE|service_role|SUPABASE_/);
    assert.doesNotMatch(index, /SERVICE_ROLE|service_role/);
  });
});
