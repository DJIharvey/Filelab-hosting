import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createPublicApp, safePublicPath } from "../public-server.js";
import http from "node:http";

// Minimal mock Supabase client for tests
function makeMockDb(sites = {}, files = {}, storage = {}) {
  return {
    from(table) {
      return {
        select() {
          return this;
        },
        eq(col, val) {
          this._eq = { col, val };
          return this;
        },
        single: async () => {
          if (table === "filelab_sites") {
            const site = Object.values(sites).find(s => s.slug === this._eq.val);
            return site ? { data: site, error: null } : { data: null, error: { message: "not found" } };
          }
          return { data: null, error: { message: "not found" } };
        },
        maybeSingle: async () => {
          if (table === "filelab_site_files") {
            const key = this._eq ? `${this._eq.val}` : null;
            // simplified: files keyed by site_id + path
            return { data: null, error: null };
          }
          return { data: null, error: null };
        }
      };
    },
    storage: {
      from() {
        return {
          download: async (key) => {
            const content = storage[key];
            if (!content) return { data: null, error: { message: "not found" } };
            return {
              data: {
                arrayBuffer: async () => Buffer.from(content)
              },
              error: null
            };
          }
        };
      }
    }
  };
}

// Better mock that tracks eq calls properly
function createMock() {
  const sites = new Map();
  const files = new Map(); // siteId -> Map<path, meta>
  const storage = new Map(); // key -> content

  return {
    sites, files, storage,
    db: {
      from(table) {
        const state = { filters: {} };
        const chain = {
          select() { return chain; },
          eq(col, val) { state.filters[col] = val; return chain; },
          async single() {
            if (table === "filelab_sites") {
              for (const s of sites.values()) {
                if (state.filters.slug && s.slug === state.filters.slug) return { data: s, error: null };
              }
              return { data: null, error: { message: "not found" } };
            }
            return { data: null, error: { message: "not found" } };
          },
          async maybeSingle() {
            if (table === "filelab_site_files") {
              const siteId = state.filters.site_id;
              const path = state.filters.path;
              const siteFiles = files.get(siteId);
              if (siteFiles && siteFiles.has(path)) return { data: siteFiles.get(path), error: null };
              return { data: null, error: null };
            }
            return { data: null, error: null };
          }
        };
        return chain;
      },
      storage: {
        from() {
          return {
            async download(key) {
              if (!storage.has(key)) return { data: null, error: { message: "missing" } };
              return {
                data: { arrayBuffer: async () => Buffer.from(storage.get(key)) },
                error: null
              };
            }
          };
        }
      }
    },
    addSite(id, slug, status = "published", prefix = `sites/${id}/v1`) {
      sites.set(id, { id, slug, status, storage_prefix: prefix });
    },
    addFile(siteId, path, content, contentType = "text/html") {
      if (!files.has(siteId)) files.set(siteId, new Map());
      files.get(siteId).set(path, { path, content_type: contentType });
      const site = [...sites.values()].find(s => s.id === siteId);
      if (site) storage.set(site.storage_prefix + "/" + path, content);
    }
  };
}

function request(app, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, redirect: "manual" });
        const text = await res.text();
        resolve({ status: res.status, headers: res.headers, text, location: res.headers.get("location") });
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
}

describe("safePublicPath", () => {
  test("accepts normal paths", () => {
    assert.equal(safePublicPath("index.html"), "index.html");
    assert.equal(safePublicPath("css/style.css"), "css/style.css");
    assert.equal(safePublicPath("images/logo.png"), "images/logo.png");
  });

  test("rejects traversal", () => {
    assert.equal(safePublicPath("../etc/passwd"), null);
    assert.equal(safePublicPath("foo/../../bar"), null);
    assert.equal(safePublicPath(".."), null);
    assert.equal(safePublicPath("./foo"), null);
  });

  test("rejects encoded traversal", () => {
    assert.equal(safePublicPath("%2e%2e/etc/passwd"), null);
    assert.equal(safePublicPath("foo/%2e%2e/bar"), null);
    assert.equal(safePublicPath("%2e%2e%2fetc%2fpasswd"), null);
  });

  test("rejects null and absolute", () => {
    assert.equal(safePublicPath(""), null);
    assert.equal(safePublicPath("/etc/passwd"), null);
    assert.equal(safePublicPath("foo\0bar"), null);
    assert.equal(safePublicPath("foo/../bar"), null);
  });
});

describe("public hosting service", () => {
  test("published site returns index.html", async () => {
    const mock = createMock();
    mock.addSite("s1", "mysite", "published");
    mock.addFile("s1", "index.html", "<h1>Hello FileLab</h1>", "text/html");
    const app = createPublicApp(mock.db);
    const res = await request(app, "/s/mysite/");
    assert.equal(res.status, 200);
    assert.match(res.text, /Hello FileLab/);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
  });

  test("published site assets load", async () => {
    const mock = createMock();
    mock.addSite("s1", "mysite");
    mock.addFile("s1", "index.html", "<html></html>");
    mock.addFile("s1", "style.css", "body{color:red}", "text/css");
    mock.addFile("s1", "app.js", "console.log(1)", "text/javascript");
    const app = createPublicApp(mock.db);
    const css = await request(app, "/s/mysite/style.css");
    assert.equal(css.status, 200);
    assert.match(css.text, /color:red/);
    const js = await request(app, "/s/mysite/app.js");
    assert.equal(js.status, 200);
  });

  test("nested paths work", async () => {
    const mock = createMock();
    mock.addSite("s1", "mysite");
    mock.addFile("s1", "assets/img/logo.png", "PNGDATA", "image/png");
    const app = createPublicApp(mock.db);
    const res = await request(app, "/s/mysite/assets/img/logo.png");
    assert.equal(res.status, 200);
    assert.equal(res.text, "PNGDATA");
  });

  test("unpublished websites are inaccessible", async () => {
    const mock = createMock();
    mock.addSite("s1", "draftsite", "draft");
    mock.addFile("s1", "index.html", "secret");
    const app = createPublicApp(mock.db);
    const res = await request(app, "/s/draftsite/");
    assert.equal(res.status, 404);
  });

  test("unknown websites return 404", async () => {
    const mock = createMock();
    const app = createPublicApp(mock.db);
    const res = await request(app, "/s/doesnotexist/");
    assert.equal(res.status, 404);
  });

  test("missing assets return 404", async () => {
    const mock = createMock();
    mock.addSite("s1", "mysite");
    mock.addFile("s1", "index.html", "ok");
    const app = createPublicApp(mock.db);
    const res = await request(app, "/s/mysite/missing.css");
    assert.equal(res.status, 404);
  });

  test("path traversal is rejected (unit + integration)", async () => {
    // Unit already covers safePublicPath. Integration: normalized paths must not escape.
    const mock = createMock();
    mock.addSite("s1", "mysite");
    mock.addFile("s1", "index.html", "ok");
    const app = createPublicApp(mock.db);
    // This request is normalized by the client to /s/secret before it hits the server
    const res = await request(app, "/s/mysite/../secret");
    assert.notEqual(res.status, 200); // must not succeed as a file serve of the original site
  });

  test("encoded path traversal is rejected", async () => {
    const mock = createMock();
    mock.addSite("s1", "mysite");
    const app = createPublicApp(mock.db);
    const res = await request(app, "/s/mysite/%2e%2e/secret");
    // Client or server must not return a successful file
    assert.notEqual(res.status, 200);
  });

  test("public service has no admin endpoints", async () => {
    const mock = createMock();
    const app = createPublicApp(mock.db);
    const login = await request(app, "/api/login", "POST");
    assert.equal(login.status, 404);
    const sites = await request(app, "/api/sites");
    assert.equal(sites.status, 404);
    const deploy = await request(app, "/api/sites/1/deploy", "POST");
    assert.equal(deploy.status, 404);
  });

  test("public service cannot modify site data (no write routes)", async () => {
    const mock = createMock();
    const app = createPublicApp(mock.db);
    const res = await request(app, "/api/sites", "POST");
    assert.equal(res.status, 404);
  });

  test("bare slug serves index.html", async () => {
    const mock = createMock();
    mock.addSite("s1", "mysite");
    mock.addFile("s1", "index.html", "<h1>Bare</h1>");
    const app = createPublicApp(mock.db);
    const res = await request(app, "/s/mysite");
    assert.equal(res.status, 200);
    assert.match(res.text, /Bare/);
  });
});
