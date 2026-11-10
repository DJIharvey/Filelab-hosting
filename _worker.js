var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/util.js
function limits(env) {
  return {
    maxProjects: num(env.MAX_PROJECTS_PER_USER, 10),
    maxFileBytes: num(env.MAX_FILE_BYTES, 10 * 1024 * 1024),
    maxZipBytes: num(env.MAX_ZIP_BYTES, 25 * 1024 * 1024),
    maxProjectBytes: num(env.MAX_PROJECT_BYTES, 100 * 1024 * 1024),
    maxFiles: num(env.MAX_FILES, 500),
    aiDaily: num(env.AI_DAILY_LIMIT, 25)
  };
}
function b64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
async function sha256hex(data) {
  const d = await crypto.subtle.digest("SHA-256", typeof data === "string" ? utf8(data) : data);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}
async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, key, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(hash)}`;
}
async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split("$");
  if (alg !== "pbkdf2") return false;
  const got = await derive(password, unb64(salt), parseInt(iter, 10));
  return timingSafeEqual(got, unb64(hash));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function signToken(secret, payload) {
  if (!secret || secret.length < 16) throw new HttpError(500, "Server is missing APP_SECRET (see README).");
  const body = b64url(utf8(payload));
  const sig = b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), utf8(body)));
  return `${body}.${sig}`;
}
async function verifyToken(secret, token) {
  if (!secret || secret.length < 16) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expect = b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), utf8(body)));
  if (!timingSafeEqual(utf8(sig), utf8(expect))) return null;
  try {
    return new TextDecoder().decode(unb64(body.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
function cleanPath(p) {
  if (typeof p !== "string") throw new HttpError(400, "Invalid path.");
  p = p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!p || p.length > 240) throw new HttpError(400, "Invalid path length.");
  const segs = p.split("/");
  if (segs.length > 12) throw new HttpError(400, "Path is nested too deeply.");
  for (const s of segs) {
    if (!s || s === "." || s === ".." || s.length > 100 || /[\x00-\x1f<>:"|?*#%]/.test(s)) {
      throw new HttpError(400, `Invalid file or folder name: "${s}". Avoid  < > : " | ? * # %  and "..".`);
    }
  }
  return segs.join("/");
}
function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return ~c >>> 0;
}
function validSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && !slug.includes("--") && !RESERVED_SLUGS.has(slug);
}
async function readJson(request, max = 64 * 1024) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Request too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
var HttpError, json, now, today, num, uid, enc, utf8, b64url, PBKDF2_ITER, KEEP, isKeep, TYPES, ext, contentTypeFor, TEXT_EXT, isTextPath, SAFE_RAW, rawTypeFor, CRC_TABLE, RESERVED_SLUGS, slugify;
var init_util = __esm({
  "src/util.js"() {
    HttpError = class extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
      }
    };
    json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
    });
    now = () => Date.now();
    today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    num = (v, d) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : d;
    };
    uid = (prefix = "", bytes = 10) => {
      const b = crypto.getRandomValues(new Uint8Array(bytes));
      return prefix + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    };
    enc = new TextEncoder();
    utf8 = (s) => enc.encode(s);
    b64url = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    PBKDF2_ITER = 1e5;
    KEEP = ".keep";
    isKeep = (path) => path === KEEP || path.endsWith("/" + KEEP);
    TYPES = {
      html: "text/html; charset=utf-8",
      htm: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "text/javascript; charset=utf-8",
      mjs: "text/javascript; charset=utf-8",
      json: "application/json; charset=utf-8",
      map: "application/json; charset=utf-8",
      webmanifest: "application/manifest+json; charset=utf-8",
      txt: "text/plain; charset=utf-8",
      md: "text/markdown; charset=utf-8",
      csv: "text/csv; charset=utf-8",
      xml: "application/xml; charset=utf-8",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      avif: "image/avif",
      ico: "image/x-icon",
      bmp: "image/bmp",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      otf: "font/otf",
      eot: "application/vnd.ms-fontobject",
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      pdf: "application/pdf",
      wasm: "application/wasm",
      zip: "application/zip"
    };
    ext = (path) => (path.split("/").pop().split(".").slice(1).pop() || "").toLowerCase();
    contentTypeFor = (path) => TYPES[ext(path)] || "application/octet-stream";
    TEXT_EXT = /* @__PURE__ */ new Set(["html", "htm", "css", "js", "mjs", "json", "map", "webmanifest", "txt", "md", "csv", "xml", "svg", "yml", "yaml", "toml", "ini", "env", "ts", "tsx", "jsx", "vue", "scss", "sass", "less", "php", "htaccess", "keep", ""]);
    isTextPath = (path) => TEXT_EXT.has(ext(path)) || path.split("/").pop().startsWith(".");
    SAFE_RAW = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "svg", "woff", "woff2", "ttf", "otf", "mp3", "wav", "ogg", "mp4", "webm"]);
    rawTypeFor = (path) => SAFE_RAW.has(ext(path)) ? contentTypeFor(path) : "text/plain; charset=utf-8";
    CRC_TABLE = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        t[n] = c >>> 0;
      }
      return t;
    })();
    RESERVED_SLUGS = /* @__PURE__ */ new Set(["www", "app", "api", "admin", "dashboard", "preview", "s", "static", "assets", "mail", "ftp", "cdn", "login", "signup", "status", "help", "docs", "blog", "dev", "staging"]);
    slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 40).replace(/-+$/, "");
  }
});

// src/storage.js
var storage_exports = {};
__export(storage_exports, {
  assertQuota: () => assertQuota,
  blobKey: () => blobKey,
  gcProject: () => gcProject,
  getFileRow: () => getFileRow,
  listFiles: () => listFiles,
  purgeProjectBlobs: () => purgeProjectBlobs,
  putFile: () => putFile,
  putFiles: () => putFiles,
  readText: () => readText,
  stageFile: () => stageFile,
  storageUsed: () => storageUsed
});
async function storageUsed(env, projectId) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(size),0) AS bytes FROM (
       SELECT hash, size FROM files WHERE project_id = ?1
       UNION SELECT hash, size FROM deployment_files WHERE project_id = ?1)`
  ).bind(projectId).first();
  return row.bytes;
}
async function assertQuota(env, projectId, addBytes, addFiles = 0) {
  const L = limits(env);
  const used = await storageUsed(env, projectId);
  if (used + addBytes > L.maxProjectBytes) {
    throw new HttpError(413, `Storage limit reached (${Math.round(L.maxProjectBytes / 1048576)} MB per site, including old deployments). Delete old deployments or files, then run "Clean up storage".`);
  }
  if (addFiles) {
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM files WHERE project_id = ?").bind(projectId).first();
    if (c.n + addFiles > L.maxFiles) throw new HttpError(413, `File limit reached (${L.maxFiles} files per site).`);
  }
}
async function stageFile(env, projectId, path, bytes, precomputedCrc) {
  path = cleanPath(path);
  const L = limits(env);
  if (bytes.length > L.maxFileBytes) throw new HttpError(413, `"${path}" is larger than the ${Math.round(L.maxFileBytes / 1048576)} MB per-file limit.`);
  const hash = await sha256hex(bytes);
  const ct = contentTypeFor(path);
  await env.SITES.put(blobKey(projectId, hash), bytes, { httpMetadata: { contentType: ct } });
  const crc = precomputedCrc ?? crc32(bytes);
  return { path, size: bytes.length, stmt: env.DB.prepare(upsertSql).bind(projectId, path, hash, bytes.length, crc, ct, now()) };
}
async function putFile(env, projectId, path, bytes) {
  const existing = await env.DB.prepare("SELECT 1 FROM files WHERE project_id = ? AND path = ?").bind(projectId, cleanPath(path)).first();
  await assertQuota(env, projectId, bytes.length, existing ? 0 : 1);
  const s = await stageFile(env, projectId, path, bytes);
  await s.stmt.run();
  await env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), projectId).run();
  return { path: s.path, size: s.size };
}
async function putFiles(env, projectId, items) {
  const total = items.reduce((n, i) => n + i.bytes.length, 0);
  const existing = new Set((await env.DB.prepare("SELECT path FROM files WHERE project_id = ?").bind(projectId).all()).results.map((r) => r.path));
  const fresh = items.filter((i) => !existing.has(cleanPath(i.path))).length;
  await assertQuota(env, projectId, total, fresh);
  const stmts = [];
  for (const group of chunk(items, 10)) {
    const staged = await Promise.all(group.map((i) => stageFile(env, projectId, i.path, i.bytes, i.crc)));
    stmts.push(...staged.map((s) => s.stmt));
  }
  for (const group of chunk(stmts, 50)) await env.DB.batch(group);
  await env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), projectId).run();
}
async function listFiles(env, projectId) {
  const { results } = await env.DB.prepare(
    "SELECT path, size, content_type, updated_at FROM files WHERE project_id = ? ORDER BY path"
  ).bind(projectId).all();
  return results;
}
async function getFileRow(env, projectId, path) {
  return env.DB.prepare("SELECT * FROM files WHERE project_id = ? AND path = ?").bind(projectId, path).first();
}
async function readText(env, projectId, row) {
  const obj = await env.SITES.get(blobKey(projectId, row.hash));
  if (!obj) throw new HttpError(500, `Storage is missing the contents of ${row.path}.`);
  return obj.text();
}
async function purgeProjectBlobs(env, projectId) {
  let cursor;
  let removed = 0;
  do {
    const page2 = await env.SITES.list({ prefix: `p/${projectId}/`, cursor, limit: 1e3 });
    if (page2.objects.length) {
      await env.SITES.delete(page2.objects.map((o) => o.key));
      removed += page2.objects.length;
    }
    cursor = page2.truncated ? page2.cursor : void 0;
  } while (cursor);
  return removed;
}
async function gcProject(env, projectId) {
  const refs = await env.DB.prepare(
    "SELECT hash FROM files WHERE project_id = ?1 UNION SELECT hash FROM deployment_files WHERE project_id = ?1"
  ).bind(projectId).all();
  const keep = new Set(refs.results.map((r) => r.hash));
  let cursor, freed = 0, removed = 0;
  do {
    const page2 = await env.SITES.list({ prefix: `p/${projectId}/`, cursor, limit: 1e3 });
    const dead = page2.objects.filter((o) => !keep.has(o.key.split("/").pop()) && now() - new Date(o.uploaded).getTime() > 5 * 60 * 1e3);
    if (dead.length) {
      await env.SITES.delete(dead.map((o) => o.key));
      freed += dead.reduce((n, o) => n + o.size, 0);
      removed += dead.length;
    }
    cursor = page2.truncated ? page2.cursor : void 0;
  } while (cursor);
  return { removed, freed };
}
var blobKey, upsertSql;
var init_storage = __esm({
  "src/storage.js"() {
    init_util();
    blobKey = (projectId, hash) => `p/${projectId}/${hash}`;
    upsertSql = `INSERT INTO files (project_id, path, hash, size, crc, content_type, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  ON CONFLICT(project_id, path) DO UPDATE SET hash = ?3, size = ?4, crc = ?5, content_type = ?6, updated_at = ?7`;
  }
});

// src/index.js
init_util();

// src/settings.js
init_util();
async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const o = {};
  for (const r of results) o[r.key] = r.value;
  return o;
}
async function isAdmin(env, user) {
  const first = await env.DB.prepare("SELECT id FROM users ORDER BY created_at, id LIMIT 1").first();
  return !!first && first.id === user.id;
}
var DEFAULT_MODEL = { "workers-ai": "@cf/qwen/qwen2.5-coder-32b-instruct", anthropic: "claude-sonnet-5-5" };
async function aiConfig(env) {
  let s = {};
  try {
    s = await getSettings(env);
  } catch {
  }
  const fromSettings = !!s.ai_provider;
  let provider = s.ai_provider || String(env.AI_PROVIDER || "").toLowerCase() || "";
  if (provider === "auto") provider = "";
  if (!provider) provider = env.AI ? "workers-ai" : env.AI_BASE_URL ? "openai" : env.ANTHROPIC_API_KEY ? "anthropic" : "";
  const model = s.ai_model || !fromSettings && env.AI_MODEL || DEFAULT_MODEL[provider] || "";
  const baseUrl = (s.ai_base_url || env.AI_BASE_URL || "").replace(/\/+$/, "");
  const key = s.ai_key || (provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.AI_API_KEY) || "";
  if (provider === "workers-ai" && !env.AI) return { provider: null, reason: "Cloudflare AI is not available on this host. Choose another AI service in Project Settings." };
  if (provider === "anthropic" && !key) return { provider: null, reason: "No Anthropic API key has been set. Add one in Project Settings." };
  if (provider === "openai" && (!baseUrl || !model)) return { provider: null, reason: "Set the AI service address and model name in Project Settings." };
  if (!provider) return { provider: null, reason: "No AI service is configured. The site owner can set one up in Project Settings." };
  return { provider, model, baseUrl, key };
}
async function adminSettingsView(env, user) {
  const admin = await isAdmin(env, user);
  if (!admin) return json({ is_admin: false });
  const s = await getSettings(env);
  const cfg = await aiConfig(env);
  return json({
    is_admin: true,
    ai: { provider: s.ai_provider || "auto", base_url: s.ai_base_url || "", model: s.ai_model || "", has_key: !!s.ai_key },
    effective: { provider: cfg.provider, model: cfg.model || null, problem: cfg.provider ? null : cfg.reason },
    cloudflare_ai_available: !!env.AI
  });
}
async function saveAdminSettings(request, env, user) {
  if (!await isAdmin(env, user)) throw new HttpError(403, "Only the site owner (the first account) can change these settings.");
  const b = await readJson(request);
  const provider = String(b.provider || "auto");
  if (!["auto", "workers-ai", "openai", "anthropic"].includes(provider)) throw new HttpError(400, "Unknown AI service.");
  const baseUrl = String(b.base_url || "").trim();
  if (baseUrl && !/^https?:\/\/[^\s]+$/i.test(baseUrl)) throw new HttpError(400, "The AI service address must start with http:// or https://");
  const model = String(b.model || "").trim().slice(0, 200);
  const put = (k, v) => env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2").bind(k, v);
  const del = (k) => env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(k);
  const stmts = [provider === "auto" ? del("ai_provider") : put("ai_provider", provider), baseUrl ? put("ai_base_url", baseUrl) : del("ai_base_url"), model ? put("ai_model", model) : del("ai_model")];
  if (b.clear_key) stmts.push(del("ai_key"));
  else if (typeof b.key === "string" && b.key.trim()) stmts.push(put("ai_key", b.key.trim().slice(0, 500)));
  await env.DB.batch(stmts);
  return adminSettingsView(env, user);
}

// src/auth.js
init_util();
var SESSION_MS = 14 * 24 * 3600 * 1e3;
var cookieName = (url) => url.protocol === "https:" ? "__Host-fl_session" : "fl_session";
function parseCookies(header) {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
async function getUser(request, env) {
  const url = new URL(request.url);
  const token = parseCookies(request.headers.get("cookie") || "")[cookieName(url)];
  if (!token || token.length < 20) return null;
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"
  ).bind(await sha256hex(token)).first();
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, email: row.email, name: row.name };
}
async function requireUser(request, env) {
  const u = await getUser(request, env);
  if (!u) throw new HttpError(401, "Please sign in.");
  return u;
}
async function rateLimit(env, key, max, windowMs, message = "Too many attempts. Please wait a few minutes and try again.") {
  const t = now();
  const row = await env.DB.prepare("SELECT window_start, count FROM rate_limits WHERE key = ?").bind(key).first();
  if (!row || t - row.window_start > windowMs) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(key) DO UPDATE SET window_start = ?2, count = 1"
    ).bind(key, t).run();
    return;
  }
  if (row.count >= max) throw new HttpError(429, message);
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}
var clientIp = (request) => request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
async function startSession(env, request, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const t = now();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256hex(token), userId, t, t + SESSION_MS).run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t).run();
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1e3}${secure}`;
}
async function signup(request, env) {
  if (String(env.ALLOW_SIGNUP).toLowerCase() === "false") throw new HttpError(403, "Sign-ups are disabled on this server.");
  await rateLimit(env, `signup:${clientIp(request)}`, 5, 3600 * 1e3, "Too many sign-ups from this network. Try again later.");
  const b = await readJson(request);
  if (env.INVITE_CODE && !(typeof b.invite === "string" && timingSafeEqual(utf8(b.invite), utf8(env.INVITE_CODE)))) {
    throw new HttpError(403, "A valid invite code is required.");
  }
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const name = String(b.name || "").trim().slice(0, 80);
  if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 10) throw new HttpError(400, "Password must be at least 10 characters.");
  if (password.length > 200) throw new HttpError(400, "Password is too long.");
  const id = uid("u_");
  try {
    await env.DB.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, name, await hashPassword(password), now()).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, "An account with that email already exists.");
    throw e;
  }
  const cookie = await startSession(env, request, id);
  return json({ user: { id, email, name } }, 201, { "set-cookie": cookie });
}
async function login(request, env) {
  const b = await readJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  await rateLimit(env, `login:${clientIp(request)}:${email}`, 10, 15 * 60 * 1e3);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const ok = user ? await verifyPassword(password, user.password_hash) : (await hashPassword(password), false);
  if (!ok) throw new HttpError(401, "Incorrect email or password.");
  const cookie = await startSession(env, request, user.id);
  return json({ user: { id: user.id, email: user.email, name: user.name } }, 200, { "set-cookie": cookie });
}
async function logout(request, env) {
  const url = new URL(request.url);
  const token = parseCookies(request.headers.get("cookie") || "")[cookieName(url)];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256hex(token)).run();
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 200, { "set-cookie": `${cookieName(url)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}` });
}

// src/projects.js
init_util();
init_storage();

// src/templates.js
function starterFiles(name) {
  const safe = String(name).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safe}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="hero">
    <h1>${safe}</h1>
    <p>This site is hosted on FileLab. Edit it in the file manager, ask the AI builder to redesign it, or upload your own files.</p>
    <button id="hello">Say hello</button>
    <p id="out" aria-live="polite"></p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`;
  const css = `*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0d0f14;color:#e8eaf0}
.hero{max-width:34rem;padding:2rem;text-align:center}
h1{font-size:clamp(2rem,6vw,3.2rem);margin:0 0 1rem;background:linear-gradient(90deg,#6aa2ff,#a77bff);-webkit-background-clip:text;background-clip:text;color:transparent}
p{color:#9aa3b5;line-height:1.6}
button{background:linear-gradient(90deg,#4f86ff,#8b5cf6);color:#fff;border:0;border-radius:10px;padding:.8rem 1.4rem;font-size:1rem;cursor:pointer}
button:hover{filter:brightness(1.1)}
`;
  const js = `document.getElementById('hello').addEventListener('click', function () {
  document.getElementById('out').textContent = 'Hello from your FileLab site! ' + new Date().toLocaleTimeString();
});
`;
  return [
    { path: "index.html", bytes: new TextEncoder().encode(html) },
    { path: "style.css", bytes: new TextEncoder().encode(css) },
    { path: "script.js", bytes: new TextEncoder().encode(js) }
  ];
}

// src/projects.js
async function loadProject(env, user, id) {
  const p = await env.DB.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").bind(id, user.id).first();
  if (!p) throw new HttpError(404, "Website not found.");
  return p;
}
function siteUrl(env, origin, project) {
  if (env.SITES_DOMAIN) {
    const scheme = origin.startsWith("http://") ? "http" : "https";
    return `${scheme}://${project.slug}.${env.SITES_DOMAIN}/`;
  }
  return `${origin}/s/${project.slug}/`;
}
var daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
function dto(env, origin, p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description || "",
    spa_fallback: !!p.spa_fallback,
    created_at: p.created_at,
    updated_at: p.updated_at,
    url: siteUrl(env, origin, p),
    live: !!p.active_deployment_id,
    live_number: p.live_number ?? null,
    file_count: p.file_count ?? void 0,
    workspace_bytes: p.workspace_bytes ?? void 0,
    deploy_count: p.deploy_count ?? void 0,
    views_7d: p.views_7d ?? void 0,
    last_status: p.last_status ?? void 0,
    last_deploy_at: p.last_deploy_at ?? void 0
  };
}
var projectDto = dto;
async function listProjects(env, user, origin) {
  const { results } = await env.DB.prepare(
    `SELECT p.*,
      (SELECT COUNT(*) FROM files f WHERE f.project_id = p.id AND f.path != '.keep' AND f.path NOT LIKE '%/.keep') AS file_count,
      (SELECT COALESCE(SUM(size),0) FROM files f WHERE f.project_id = p.id) AS workspace_bytes,
      (SELECT number FROM deployments d WHERE d.id = p.active_deployment_id) AS live_number,
      (SELECT COUNT(*) FROM deployments d WHERE d.project_id = p.id) AS deploy_count,
      (SELECT COALESCE(SUM(views),0) FROM usage_daily u WHERE u.project_id = p.id AND u.day >= ?1) AS views_7d,
      (SELECT status FROM deployments d WHERE d.project_id = p.id ORDER BY number DESC LIMIT 1) AS last_status,
      (SELECT created_at FROM deployments d WHERE d.project_id = p.id ORDER BY number DESC LIMIT 1) AS last_deploy_at
     FROM projects p WHERE p.user_id = ?2 ORDER BY p.updated_at DESC`
  ).bind(daysAgo(6), user.id).all();
  return json({ projects: results.map((p) => dto(env, origin, p)) });
}
async function createProject(request, env, user, origin) {
  const b = await readJson(request);
  const name = String(b.name || "").trim();
  if (!name || name.length > 60) throw new HttpError(400, "Give your website a name (up to 60 characters).");
  const slug = String(b.slug || slugify(name)).trim().toLowerCase();
  if (!validSlug(slug)) {
    throw new HttpError(400, "Project URL name must be 3\u201340 characters: lowercase letters, numbers and single hyphens, starting and ending with a letter or number (some names are reserved).");
  }
  const L = limits(env);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?").bind(user.id).first();
  if (count.n >= L.maxProjects) throw new HttpError(403, `Project limit reached (${L.maxProjects}). Delete a website to create another.`);
  const id = uid("p_");
  const t = now();
  try {
    await env.DB.prepare(
      "INSERT INTO projects (id, user_id, name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, user.id, name, slug, String(b.description || "").slice(0, 300), t, t).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, `The URL name "${slug}" is already taken. Choose another.`);
    throw e;
  }
  if (b.template === "starter") await putFiles(env, id, starterFiles(name));
  const p = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
  return json({ project: dto(env, origin, p) }, 201);
}
async function updateProject(request, env, project, origin) {
  const b = await readJson(request);
  const name = b.name !== void 0 ? String(b.name).trim() : project.name;
  if (!name || name.length > 60) throw new HttpError(400, "Name must be 1\u201360 characters.");
  const description = b.description !== void 0 ? String(b.description).slice(0, 300) : project.description;
  const spa = b.spa_fallback !== void 0 ? b.spa_fallback ? 1 : 0 : project.spa_fallback;
  await env.DB.prepare("UPDATE projects SET name = ?, description = ?, spa_fallback = ?, updated_at = ? WHERE id = ?").bind(name, description, spa, now(), project.id).run();
  const p = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(project.id).first();
  return json({ project: dto(env, origin, p) });
}
async function deleteProject(env, project) {
  await purgeProjectBlobs(env, project.id);
  await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(project.id).run();
  return json({ ok: true });
}
async function overview(env, user, origin) {
  const d7 = daysAgo(6);
  const [counts, deps, storage2] = await Promise.all([
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM projects WHERE user_id = ?1) AS sites,
              (SELECT COUNT(*) FROM projects WHERE user_id = ?1 AND active_deployment_id IS NOT NULL) AS live,
              (SELECT COUNT(*) FROM deployments WHERE user_id = ?1) AS deployments,
              (SELECT COALESCE(SUM(u.views),0) FROM usage_daily u JOIN projects p ON p.id = u.project_id WHERE p.user_id = ?1 AND u.day >= ?2) AS views_7d`
    ).bind(user.id, d7).first(),
    recentDeployments(env, user, 8),
    storageSummary(env, user)
  ]);
  return json({ counts, recent_deployments: deps, storage: { used: storage2.used, quota_per_site: limits(env).maxProjectBytes } });
}
async function recentDeployments(env, user, n = 30) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.project_id, d.number, d.status, d.note, d.file_count, d.total_bytes, d.error, d.created_at, d.finished_at,
            p.name AS project_name, p.slug AS project_slug, (p.active_deployment_id = d.id) AS is_live
     FROM deployments d JOIN projects p ON p.id = d.project_id WHERE p.user_id = ? ORDER BY d.created_at DESC LIMIT ?`
  ).bind(user.id, n).all();
  return results;
}
async function storageSummary(env, user) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.slug,
        COALESCE((SELECT SUM(size) FROM files f WHERE f.project_id = p.id), 0) AS workspace_bytes,
        COALESCE((SELECT SUM(size) FROM (SELECT hash, size FROM files WHERE project_id = p.id
                  UNION SELECT hash, size FROM deployment_files WHERE project_id = p.id)), 0) AS total_bytes,
        (SELECT COUNT(*) FROM deployments d WHERE d.project_id = p.id) AS deployments
     FROM projects p WHERE p.user_id = ? ORDER BY total_bytes DESC`
  ).bind(user.id).all();
  return { projects: results, used: results.reduce((n, r) => n + r.total_bytes, 0) };
}
async function storage(env, user) {
  const s = await storageSummary(env, user);
  return json({ ...s, quota_per_site: limits(env).maxProjectBytes, max_file_bytes: limits(env).maxFileBytes });
}
async function usage(env, user) {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(daysAgo(i));
  const { results: projs } = await env.DB.prepare("SELECT id, name, slug FROM projects WHERE user_id = ?").bind(user.id).all();
  const { results: rows } = await env.DB.prepare(
    "SELECT u.project_id, u.day, u.views FROM usage_daily u JOIN projects p ON p.id = u.project_id WHERE p.user_id = ? AND u.day >= ?"
  ).bind(user.id, days[0]).all();
  const by = {};
  for (const r of rows) (by[r.project_id] ||= {})[r.day] = r.views;
  const projects = projs.map((p) => {
    const series = days.map((d) => by[p.id]?.[d] || 0);
    return { ...p, series, total: series.reduce((a, b) => a + b, 0) };
  });
  const totals = days.map((_, i) => projects.reduce((n, p) => n + p.series[i], 0));
  const ai = await env.DB.prepare("SELECT count FROM ai_usage WHERE user_id = ? AND day = ?").bind(user.id, today()).first();
  return json({ days, totals, projects, ai: { used_today: ai?.count || 0, daily_limit: limits(env).aiDaily, enabled: !!(await aiConfig(env)).provider } });
}

// src/files.js
init_util();
init_storage();

// src/zip.js
init_util();
var u16 = (v, o) => v.getUint16(o, true);
var u32 = (v, o) => v.getUint32(o, true);
function listZipEntries(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (u32(view, i) === 101010256) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new HttpError(400, "This does not look like a valid ZIP file.");
  const total = u16(view, eocd + 10);
  const cdSize = u32(view, eocd + 12);
  const cdOffset = u32(view, eocd + 16);
  if (total === 65535 || cdSize === 4294967295 || cdOffset === 4294967295) {
    throw new HttpError(400, "ZIP64 archives are not supported. Re-create the ZIP with standard compression.");
  }
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || u32(view, p) !== 33639248) throw new HttpError(400, "ZIP central directory is corrupt.");
    const flags = u16(view, p + 8);
    const method = u16(view, p + 10);
    const crc = u32(view, p + 16);
    const csize = u32(view, p + 20);
    const usize = u32(view, p + 24);
    const nlen = u16(view, p + 28), elen = u16(view, p + 30), clen = u16(view, p + 32);
    const offset = u32(view, p + 42);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    entries.push({ name, method, crc, csize, usize, offset, encrypted: (flags & 1) === 1 });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}
async function readZipEntry(buf, e, maxBytes) {
  if (e.encrypted) throw new HttpError(400, `"${e.name}" is encrypted; password-protected ZIPs are not supported.`);
  if (e.usize > maxBytes) throw new HttpError(413, `"${e.name}" is larger than the ${Math.round(maxBytes / 1048576)} MB per-file limit.`);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (e.offset + 30 > buf.length || u32(view, e.offset) !== 67324752) throw new HttpError(400, "ZIP local header is corrupt.");
  const start = e.offset + 30 + u16(view, e.offset + 26) + u16(view, e.offset + 28);
  const raw = buf.subarray(start, start + e.csize);
  let out;
  if (e.method === 0) {
    out = raw;
  } else if (e.method === 8) {
    const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = ds.getReader();
    const parts = [];
    let size = 0;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes || size > e.usize + 1024) {
        await reader.cancel();
        throw new HttpError(400, `"${e.name}" expands beyond its declared size (possible ZIP bomb).`);
      }
      parts.push(value);
    }
    out = new Uint8Array(size);
    let o = 0;
    for (const c of parts) {
      out.set(c, o);
      o += c.length;
    }
  } else {
    throw new HttpError(400, `"${e.name}" uses an unsupported compression method (${e.method}).`);
  }
  const crc = crc32(out);
  if (crc !== e.crc) throw new HttpError(400, `"${e.name}" failed its CRC check; the ZIP is corrupt.`);
  return { bytes: out, crc };
}
function dosDateTime(ms) {
  const d = new Date(ms);
  const time = d.getUTCHours() << 11 | d.getUTCMinutes() << 5 | d.getUTCSeconds() >> 1;
  const date = Math.max(d.getUTCFullYear(), 1980) - 1980 << 9 | d.getUTCMonth() + 1 << 5 | d.getUTCDate();
  return { time, date };
}
function zipStream(files) {
  const te = new TextEncoder();
  const central = [];
  let offset = 0;
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        if (i < files.length) {
          const f = files[i++];
          const name = te.encode(f.path);
          const { time, date } = dosDateTime(f.updated_at || Date.now());
          const h = new DataView(new ArrayBuffer(30));
          h.setUint32(0, 67324752, true);
          h.setUint16(4, 20, true);
          h.setUint16(6, 2048, true);
          h.setUint16(8, 0, true);
          h.setUint16(10, time, true);
          h.setUint16(12, date, true);
          h.setUint32(14, f.crc, true);
          h.setUint32(18, f.size, true);
          h.setUint32(22, f.size, true);
          h.setUint16(26, name.length, true);
          h.setUint16(28, 0, true);
          controller.enqueue(new Uint8Array(h.buffer));
          controller.enqueue(name);
          const body = await f.body();
          const reader = body.getReader();
          let sent = 0;
          for (; ; ) {
            const { done, value } = await reader.read();
            if (done) break;
            sent += value.length;
            controller.enqueue(value);
          }
          if (sent !== f.size) throw new Error(`size mismatch while zipping ${f.path}`);
          central.push({ name, f, time, date, offset });
          offset += 30 + name.length + f.size;
        } else {
          let cdSize = 0;
          for (const c of central) {
            const h = new DataView(new ArrayBuffer(46));
            h.setUint32(0, 33639248, true);
            h.setUint16(4, 20, true);
            h.setUint16(6, 20, true);
            h.setUint16(8, 2048, true);
            h.setUint16(10, 0, true);
            h.setUint16(12, c.time, true);
            h.setUint16(14, c.date, true);
            h.setUint32(16, c.f.crc, true);
            h.setUint32(20, c.f.size, true);
            h.setUint32(24, c.f.size, true);
            h.setUint16(28, c.name.length, true);
            h.setUint32(42, c.offset, true);
            controller.enqueue(new Uint8Array(h.buffer));
            controller.enqueue(c.name);
            cdSize += 46 + c.name.length;
          }
          const e = new DataView(new ArrayBuffer(22));
          e.setUint32(0, 101010256, true);
          e.setUint16(8, central.length, true);
          e.setUint16(10, central.length, true);
          e.setUint32(12, cdSize, true);
          e.setUint32(16, offset, true);
          controller.enqueue(new Uint8Array(e.buffer));
          controller.close();
        }
      } catch (err) {
        controller.error(err);
      }
    }
  });
}

// src/files.js
var SANDBOX_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";
async function handleList(env, project) {
  return json({ files: await listFiles(env, project.id) });
}
async function handleRead(env, project, url) {
  const path = cleanPath(url.searchParams.get("path") || "");
  const row = await getFileRow(env, project.id, path);
  if (!row) throw new HttpError(404, "File not found.");
  const obj = await env.SITES.get(blobKey(project.id, row.hash));
  if (!obj) throw new HttpError(500, "File contents are missing from storage.");
  const headers = {
    // Dashboard origin never serves user HTML/JS as executable content.
    "content-type": rawTypeFor(path),
    "content-security-policy": SANDBOX_CSP,
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "content-length": String(row.size)
  };
  if (url.searchParams.get("download")) {
    headers["content-type"] = "application/octet-stream";
    headers["content-disposition"] = `attachment; filename="${path.split("/").pop().replace(/"/g, "")}"`;
  }
  return new Response(obj.body, { headers });
}
async function handleWrite(request, env, project, url) {
  const path = cleanPath(url.searchParams.get("path") || "");
  if (isKeep(path)) throw new HttpError(400, "That name is reserved.");
  const L = limits(env);
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (len > L.maxFileBytes) throw new HttpError(413, `File is larger than the ${Math.round(L.maxFileBytes / 1048576)} MB limit.`);
  const bytes = new Uint8Array(await request.arrayBuffer());
  const r = await putFile(env, project.id, path, bytes);
  return json({ file: r });
}
var prefixOf = (p) => p + "/";
async function handleDelete(request, env, project) {
  const b = await readJson(request);
  const path = cleanPath(b.path);
  let res;
  if (b.folder) {
    const pre = prefixOf(path);
    res = await env.DB.prepare("DELETE FROM files WHERE project_id = ?1 AND substr(path, 1, ?3) = ?2").bind(project.id, pre, pre.length).run();
  } else {
    res = await env.DB.prepare("DELETE FROM files WHERE project_id = ? AND path = ?").bind(project.id, path).run();
  }
  if (!res.meta.changes) throw new HttpError(404, "Nothing to delete.");
  await env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), project.id).run();
  return json({ deleted: res.meta.changes });
}
async function handleRename(request, env, project) {
  const b = await readJson(request);
  const from = cleanPath(b.from);
  const to = cleanPath(b.to);
  if (from === to) return json({ moved: 0 });
  if (b.folder) {
    if (to.startsWith(prefixOf(from))) throw new HttpError(400, "A folder cannot be moved into itself.");
    const oldP = prefixOf(from), newP = prefixOf(to);
    const clash = await env.DB.prepare("SELECT 1 FROM files WHERE project_id = ?1 AND (path = ?3 OR substr(path, 1, ?4) = ?2) LIMIT 1").bind(project.id, newP, to, newP.length).first();
    if (clash) throw new HttpError(409, "A file or folder with that name already exists.");
    const res2 = await env.DB.prepare(
      "UPDATE files SET path = ?3 || substr(path, ?4), updated_at = ?6 WHERE project_id = ?1 AND substr(path, 1, ?5) = ?2"
    ).bind(project.id, oldP, newP, oldP.length + 1, oldP.length, now()).run();
    if (!res2.meta.changes) throw new HttpError(404, "Folder not found.");
    return json({ moved: res2.meta.changes });
  }
  if (isKeep(to)) throw new HttpError(400, "That name is reserved.");
  if (await getFileRow(env, project.id, to)) throw new HttpError(409, "A file with that name already exists.");
  const res = await env.DB.prepare("UPDATE files SET path = ?3, updated_at = ?4 WHERE project_id = ?1 AND path = ?2").bind(project.id, from, to, now()).run();
  if (!res.meta.changes) throw new HttpError(404, "File not found.");
  return json({ moved: 1 });
}
async function handleMkdir(request, env, project) {
  const b = await readJson(request);
  const path = cleanPath(b.path);
  const r = await putFile(env, project.id, `${path}/${KEEP}`, new Uint8Array(0));
  return json({ folder: path, placeholder: r.path });
}
var JUNK = (name) => name.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/.test(name) || /(^|\/)Thumbs\.db$/i.test(name);
async function handleZipImport(request, env, project, url) {
  const L = limits(env);
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (len > L.maxZipBytes) throw new HttpError(413, `ZIP is larger than the ${Math.round(L.maxZipBytes / 1048576)} MB limit.`);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > L.maxZipBytes) throw new HttpError(413, `ZIP is larger than the ${Math.round(L.maxZipBytes / 1048576)} MB limit.`);
  if (!buf.length) throw new HttpError(400, "Empty upload.");
  const target = url.searchParams.get("target") ? cleanPath(url.searchParams.get("target")) : "";
  const replace = url.searchParams.get("replace") === "1";
  let entries = listZipEntries(buf).filter((e) => !e.name.endsWith("/") && !JUNK(e.name));
  if (!entries.length) throw new HttpError(400, "The ZIP contains no files.");
  for (const e of entries) {
    const n = e.name.replace(/\\/g, "/");
    if (n.startsWith("/") || n.split("/").includes("..")) throw new HttpError(400, `Unsafe path in ZIP: "${e.name}". Upload refused.`);
  }
  let stripped = null;
  const tops = new Set(entries.map((e) => e.name.replace(/\\/g, "/").split("/")[0]));
  if (tops.size === 1 && entries.every((e) => e.name.includes("/"))) {
    stripped = [...tops][0];
    entries = entries.map((e) => ({ ...e, name: e.name.replace(/\\/g, "/").slice(stripped.length + 1) }));
  }
  if (entries.length > L.maxFiles) throw new HttpError(413, `ZIP has ${entries.length} files; the limit is ${L.maxFiles} per site.`);
  const declared = entries.reduce((n, e) => n + e.usize, 0);
  await assertQuota(env, project.id, declared);
  const stamp = now();
  const skipped = [];
  let added = 0, bytes = 0, stmts = [];
  const flush = async () => {
    for (const g of chunk(stmts, 50)) await env.DB.batch(g);
    stmts = [];
  };
  for (const e of entries) {
    let path;
    try {
      path = cleanPath(target ? `${target}/${e.name}` : e.name);
      if (isKeep(path)) throw new Error("reserved");
    } catch (err) {
      skipped.push(`${e.name} (unsupported file name)`);
      continue;
    }
    const { bytes: data, crc } = await readZipEntry(buf, e, L.maxFileBytes);
    const s = await stageFile(env, project.id, path, data, crc);
    stmts.push(s.stmt);
    added++;
    bytes += data.length;
    if (stmts.length >= 50) await flush();
  }
  await flush();
  if (replace) {
    await env.DB.prepare("DELETE FROM files WHERE project_id = ? AND updated_at < ?").bind(project.id, stamp).run();
  }
  await env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), project.id).run();
  return json({ added, bytes, skipped, unwrapped_folder: stripped }, 201);
}
async function handleDownload(env, project) {
  const rows = (await listFiles(env, project.id)).filter((r) => !isKeep(r.path));
  if (!rows.length) throw new HttpError(400, "This website has no files to download.");
  const full = await env.DB.prepare("SELECT path, hash, size, crc, updated_at FROM files WHERE project_id = ? ORDER BY path").bind(project.id).all();
  const files = full.results.filter((r) => !isKeep(r.path)).map((r) => ({
    ...r,
    body: async () => {
      const o = await env.SITES.get(blobKey(project.id, r.hash));
      if (!o) throw new Error(`missing blob for ${r.path}`);
      return o.body;
    }
  }));
  const spa = !!project.spa_fallback;
  const presets = {
    "netlify.toml": ["# FileLab export - Netlify static site preset", "[build]", '  publish = "."', ...(spa ? ["", "[[redirects]]", '  from = "/*"', '  to = "/index.html"', "  status = 200"] : []), ""].join("\n"),
    "vercel.json": JSON.stringify({ ...(spa ? { rewrites: [{ source: "/(.*)", destination: "/index.html" }] } : {}), cleanUrls: false }, null, 2) + "\n",
    "render.yaml": ["# FileLab export - Render Static Site preset", "services:", "  - type: web", `    name: ${String(project.slug || "filelab-site").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`, "    runtime: static", "    buildCommand: ''", "    staticPublishPath: .", ...(spa ? ["    routes:", "      - type: rewrite", "        source: /*", "        destination: /index.html"] : []), ""].join("\n"),
    "firebase.json": JSON.stringify({ hosting: { public: ".", ignore: ["firebase.json", "**/.*", "**/node_modules/**"], ...(spa ? { rewrites: [{ source: "**", destination: "/index.html" }] } : {}) } }, null, 2) + "\n",
    "staticwebapp.config.json": JSON.stringify({ ...(spa ? { navigationFallback: { rewrite: "/index.html", exclude: ["/assets/*", "/*.{css,js,png,jpg,jpeg,gif,svg,ico}"] } } : {}) }, null, 2) + "\n",
    "README-DEPLOY-ANYWHERE.md": ["# Deploy this FileLab website anywhere", "", "This ZIP contains your actual website files plus optional hosting presets. Your website is exported as standard files; it is not locked to FileLab or Cloudflare.", "", "## Quick deploy", "", "1. Extract this ZIP.", "2. Upload the extracted folder (the folder containing index.html) to any static website host.", "3. Set the publish/output directory to the folder containing index.html. No build command is needed for plain HTML/CSS/JS sites.", "", "## Hosting presets included", "", "- **Netlify:** netlify.toml - import the folder or Git repository; publish directory is `.`.", "- **Vercel:** vercel.json - import the Git repository; framework preset Other; output directory `.`.", "- **Render:** render.yaml - create a Static Site from the repository.", "- **Firebase Hosting:** firebase.json - run `firebase deploy` from the extracted folder.", "- **Azure Static Web Apps:** staticwebapp.config.json - use the folder as the app location and leave API/build output empty for plain static sites.", "- **GitHub Pages:** upload the files to a repository and enable Pages from the main branch / root.", "", "## Other hosts", "", "This is a standard static website export. It can also be uploaded to GitLab Pages, Surge, S3-compatible static hosting, object storage website hosting, shared hosting/cPanel, or another provider that accepts static files. Choose the directory containing index.html as the site root.", "", "## Important", "", "This export contains front-end website files (HTML, CSS, JavaScript, images, fonts, etc.). A host-specific server, database, API, or build pipeline is not automatically migrated. If your project depends on server-side functions, configure those separately on the destination provider.", ""].join("\n")
  };
  const encoder = new TextEncoder();
  const existing = new Set(files.map((f) => f.path));
  for (const [path, content] of Object.entries(presets)) {
    if (existing.has(path)) continue;
    const bytes = encoder.encode(content);
    files.push({ path, size: bytes.length, crc: crc32(bytes), updated_at: now(), body: async () => new Blob([bytes]).stream() });
  }
  return new Response(zipStream(files), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${project.slug}.zip"`,
      "cache-control": "no-store"
    }
  });
}
async function handlePreviewToken(env, project) {
  const exp = now() + 60 * 60 * 1e3;
  const token = await signToken(env.APP_SECRET, `${project.id}.${exp}`);
  return json({ path: `/preview/${token}/`, expires_at: exp });
}

// src/deploy.js
init_util();
init_storage();

// src/site.js
init_util();
init_storage();
async function resolveFile(env, scope, path) {
  const target = path === "" || path.endsWith("/") ? `${path}index.html` : path;
  const sql = scope.kind === "deploy" ? "SELECT path, hash, size, content_type FROM deployment_files WHERE deployment_id = ?1 AND path = ?2" : "SELECT path, hash, size, content_type FROM files WHERE project_id = ?1 AND path = ?2";
  const id = scope.kind === "deploy" ? scope.id : scope.projectId;
  return await env.DB.prepare(sql).bind(id, target).first() || null;
}
async function resolveRequest(env, scope, rel) {
  const hit = await resolveFile(env, scope, rel);
  if (hit) return { row: hit };
  if (rel === "" || rel.endsWith("/")) return null;
  const sql = scope.kind === "deploy" ? "SELECT path, hash, size, content_type FROM deployment_files WHERE deployment_id = ?1 AND path IN (?2, ?3)" : "SELECT path, hash, size, content_type FROM files WHERE project_id = ?1 AND path IN (?2, ?3)";
  const id = scope.kind === "deploy" ? scope.id : scope.projectId;
  const { results } = await env.DB.prepare(sql).bind(id, `${rel}/index.html`, `${rel}.html`).all();
  const dir = results.find((r) => r.path === `${rel}/index.html`);
  const clean = results.find((r) => r.path === `${rel}.html`);
  if (clean) return { row: clean };
  if (dir) return { redirect: true };
  return null;
}
var page = (status, title, body) => new Response(
  `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f14;color:#e8eaf0;font:16px system-ui,sans-serif;text-align:center}
h1{font-size:2.2rem;margin:0 0 .5rem}p{color:#9aa3b5;max-width:28rem;margin:.3rem auto}small{color:#5b6477}</style>
<div><h1>${title}</h1><p>${body}</p><small>FileLab Hosting</small></div>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } }
);
async function sendFile(env, ctx, request, projectId, row, opts) {
  const etag = `"${row.hash.slice(0, 32)}"`;
  const headers = new Headers({
    "content-type": row.content_type,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  });
  if (opts.preview) {
    headers.set("cache-control", "no-store");
  } else {
    headers.set("etag", etag);
    headers.set("cache-control", "public, max-age=0, must-revalidate");
  }
  if (opts.sandbox) {
    headers.set("content-security-policy", "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-presentation");
    headers.set("access-control-allow-origin", "*");
  }
  const isHtml = row.content_type.startsWith("text/html");
  const revalidated = !opts.preview && request.headers.get("if-none-match") === etag;
  if (isHtml && opts.count && request.method === "GET") {
    ctx.waitUntil(
      env.DB.prepare(
        "INSERT INTO usage_daily (project_id, day, views) VALUES (?1, ?2, 1) ON CONFLICT(project_id, day) DO UPDATE SET views = views + 1"
      ).bind(projectId, today()).run().catch(() => {
      })
    );
  }
  if (revalidated) return new Response(null, { status: 304, headers });
  headers.set("content-length", String(row.size));
  if (request.method === "HEAD") return new Response(null, { status: opts.status || 200, headers });
  const obj = await env.SITES.get(blobKey(projectId, row.hash));
  if (!obj) return page(500, "Storage error", "This file is missing from storage. If you own this site, re-upload and redeploy.");
  return new Response(obj.body, { status: opts.status || 200, headers });
}
async function serve(env, ctx, request, scope, project, rel, opts) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  const r = await resolveRequest(env, scope, rel);
  if (r?.redirect) {
    const u = new URL(request.url);
    u.pathname += "/";
    return new Response(null, { status: 301, headers: { location: u.toString() } });
  }
  if (r?.row) return sendFile(env, ctx, request, project.id, r.row, opts);
  const last = rel.split("/").pop();
  if (project.spa_fallback && !last.includes(".")) {
    const idx = await resolveFile(env, scope, "");
    if (idx) return sendFile(env, ctx, request, project.id, idx, opts);
  }
  const nf = await resolveFile(env, scope, "404.html").catch(() => null);
  if (nf && nf.path === "404.html") return sendFile(env, ctx, request, project.id, nf, { ...opts, status: 404, count: false });
  return page(404, "Page not found", "The page you are looking for does not exist on this site.");
}
var decodePath = (pathname) => {
  try {
    return decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    throw new HttpError(400, "Bad URL encoding.");
  }
};
var safeRel = (rel) => rel.split("/").includes("..") || rel.includes("\\") || rel.includes("\0") ? null : rel;
async function serveLive(env, ctx, request, project, pathname, { sandbox }) {
  if (!project) return page(404, "Site not found", "No website exists at this address.");
  if (!project.active_deployment_id) return page(404, "Not deployed yet", "This website has been created but has not been deployed yet.");
  const rel = safeRel(decodePath(pathname));
  if (rel === null) return page(400, "Bad request", "Invalid path.");
  return serve(env, ctx, request, { kind: "deploy", id: project.active_deployment_id }, project, rel, { sandbox, count: true });
}
async function serveBySlug(env, ctx, request, slug, pathname, opts) {
  const project = await env.DB.prepare("SELECT id, slug, spa_fallback, active_deployment_id FROM projects WHERE slug = ?").bind(slug).first();
  return serveLive(env, ctx, request, project, pathname, opts);
}
async function serveByHost(env, ctx, request, host, pathname) {
  const row = await env.DB.prepare(
    `SELECT p.id, p.slug, p.spa_fallback, p.active_deployment_id FROM domains d JOIN projects p ON p.id = d.project_id
     WHERE d.hostname = ? AND d.verified = 1`
  ).bind(host).first();
  if (!row) return null;
  return serveLive(env, ctx, request, row, pathname, { sandbox: false });
}
async function servePreview(env, ctx, request, tokenAndPath) {
  const m = /^([^/]+)(\/.*)?$/.exec(tokenAndPath);
  if (!m) return page(404, "Not found", "Invalid preview link.");
  const payload = await verifyToken(env.APP_SECRET, m[1]);
  const [projectId, exp] = (payload || "").split(".");
  if (!projectId || !(parseInt(exp, 10) > now())) return page(403, "Preview expired", "Open the preview again from the dashboard.");
  const project = await env.DB.prepare("SELECT id, slug, spa_fallback FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) return page(404, "Not found", "This website no longer exists.");
  if (!m[2]) return new Response(null, { status: 302, headers: { location: new URL(request.url).pathname + "/" } });
  const rel = safeRel(decodePath(m[2]));
  if (rel === null) return page(400, "Bad request", "Invalid path.");
  return serve(env, ctx, request, { kind: "work", projectId: project.id }, project, rel, { sandbox: true, preview: true, count: false });
}

// src/deploy.js
var STALE_MS = 3 * 60 * 1e3;
async function log(env, depId, level, message) {
  await env.DB.prepare("INSERT INTO deployment_logs (deployment_id, ts, level, message) VALUES (?, ?, ?, ?)").bind(depId, now(), level, message).run();
}
var fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
async function startDeploy(request, env, ctx, user, project, origin) {
  let note = "";
  try {
    note = String((await request.json()).note || "").slice(0, 120);
  } catch {
  }
  const busy = await env.DB.prepare("SELECT id FROM deployments WHERE project_id = ? AND status IN ('queued','building') AND created_at > ?").bind(project.id, now() - STALE_MS).first();
  if (busy) throw new HttpError(409, "A deployment is already running for this website.");
  const files = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM files WHERE project_id = ? AND path != '.keep' AND path NOT LIKE '%/.keep'"
  ).bind(project.id).first();
  if (!files.n) throw new HttpError(400, "Nothing to deploy: this website has no files yet. Upload files or generate a site first.");
  const id = uid("d_");
  await env.DB.prepare(
    `INSERT INTO deployments (id, project_id, user_id, number, status, note, progress_total, created_at)
     VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(number),0)+1 FROM deployments WHERE project_id = ?2), 'queued', ?4, ?5, ?6)`
  ).bind(id, project.id, user.id, note, files.n, now()).run();
  await log(env, id, "info", `Deployment queued by ${user.email}`);
  ctx.waitUntil(
    runDeploy(env, id, project, origin).catch(async (e) => {
      try {
        await fail(env, id, e);
      } catch {
      }
    })
  );
  return json({ deployment: await getDeployment(env, id) }, 202);
}
async function fail(env, id, e) {
  const msg = e instanceof Error ? e.message : String(e);
  await log(env, id, "error", `Deployment failed: ${msg}`);
  await env.DB.prepare("UPDATE deployments SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").bind(msg, now(), id).run();
}
async function runDeploy(env, id, project, origin) {
  await env.DB.prepare("UPDATE deployments SET status = 'building' WHERE id = ?").bind(id).run();
  await log(env, id, "info", "Reading workspace file index");
  const { results: rows } = await env.DB.prepare(
    "SELECT path, hash, size, crc, content_type FROM files WHERE project_id = ? AND path != '.keep' AND path NOT LIKE '%/.keep' ORDER BY path"
  ).bind(project.id).all();
  if (!rows.length) throw new Error("No files in workspace.");
  const totalBytes = rows.reduce((n, r) => n + r.size, 0);
  await log(env, id, "info", `${rows.length} files, ${fmt(totalBytes)}`);
  if (!rows.some((r) => r.path === "index.html")) {
    await log(env, id, "warn", "No index.html at the root: visitors to the site root will see a 404 unless you add one.");
  }
  await log(env, id, "info", "Verifying files in R2 storage");
  const hashes = [...new Set(rows.map((r) => r.hash))];
  let done = 0;
  for (const group of chunk(hashes, 25)) {
    const heads = await Promise.all(group.map((h) => env.SITES.head(blobKey(project.id, h))));
    heads.forEach((h, i) => {
      if (!h) {
        const bad = rows.find((r) => r.hash === group[i]);
        throw new Error(`File "${bad.path}" is missing from storage. Re-upload it and deploy again.`);
      }
    });
    done += group.length;
    await env.DB.prepare("UPDATE deployments SET progress_done = ? WHERE id = ?").bind(Math.min(done, rows.length), id).run();
  }
  await log(env, id, "info", `Verified ${hashes.length} stored objects`);
  await log(env, id, "info", "Writing deployment manifest");
  const insert = env.DB.prepare(
    "INSERT INTO deployment_files (deployment_id, project_id, path, hash, size, crc, content_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const group of chunk(rows, 50)) {
    await env.DB.batch(group.map((r) => insert.bind(id, project.id, r.path, r.hash, r.size, r.crc, r.content_type)));
  }
  const check = await env.DB.prepare("SELECT COUNT(*) AS n FROM deployment_files WHERE deployment_id = ?").bind(id).first();
  if (check.n !== rows.length) throw new Error(`Manifest incomplete (${check.n}/${rows.length}).`);
  await log(env, id, "info", "Testing the new deployment");
  const entry = rows.find((r) => r.path === "index.html") || rows.find((r) => /\.html?$/.test(r.path));
  if (entry) {
    const hit = await resolveFile(env, { kind: "deploy", id }, entry.path);
    if (!hit) throw new Error("Deployment manifest does not resolve its own entry file.");
    const obj = await env.SITES.get(blobKey(project.id, hit.hash));
    if (!obj) throw new Error("Entry file could not be read back from storage.");
    const actual = await sha256hex(new Uint8Array(await obj.arrayBuffer()));
    if (actual !== hit.hash) throw new Error("Stored entry file does not match its checksum.");
    await log(env, id, "info", `Read back ${entry.path} from storage; checksum OK`);
  }
  await env.DB.prepare("UPDATE deployments SET status = 'ready', file_count = ?, total_bytes = ?, progress_done = progress_total, finished_at = ? WHERE id = ?").bind(rows.length, totalBytes, now(), id).run();
  await env.DB.prepare("UPDATE projects SET active_deployment_id = ?, updated_at = ? WHERE id = ?").bind(id, now(), project.id).run();
  await log(env, id, "success", `Deployment is live at ${siteUrl(env, origin, project)}`);
}
async function expireStale(env, d) {
  if ((d.status === "queued" || d.status === "building") && now() - d.created_at > STALE_MS) {
    await fail(env, d.id, new Error("Deployment timed out (the worker stopped before it finished). Try again."));
    return true;
  }
  return false;
}
async function getDeployment(env, id, withLogs = false) {
  let d = await env.DB.prepare(
    `SELECT d.*, p.name AS project_name, p.slug AS project_slug, (p.active_deployment_id = d.id) AS is_live
     FROM deployments d JOIN projects p ON p.id = d.project_id WHERE d.id = ?`
  ).bind(id).first();
  if (!d) return null;
  if (await expireStale(env, d)) d = await getDeployment(env, id);
  d.is_live = !!d.is_live;
  if (withLogs) {
    d.logs = (await env.DB.prepare("SELECT ts, level, message FROM deployment_logs WHERE deployment_id = ? ORDER BY id").bind(id).all()).results;
  }
  return d;
}
async function loadDeployment(env, user, id) {
  const d = await env.DB.prepare(
    "SELECT d.id, d.project_id FROM deployments d JOIN projects p ON p.id = d.project_id WHERE d.id = ? AND p.user_id = ?"
  ).bind(id, user.id).first();
  if (!d) throw new HttpError(404, "Deployment not found.");
  return d;
}
async function listDeployments(env, project, origin) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.number, d.status, d.note, d.file_count, d.total_bytes, d.error, d.created_at, d.finished_at, (p.active_deployment_id = d.id) AS is_live
     FROM deployments d JOIN projects p ON p.id = d.project_id WHERE d.project_id = ? ORDER BY d.number DESC LIMIT 100`
  ).bind(project.id).all();
  for (const d of results) {
    d.is_live = !!d.is_live;
    await expireStale(env, { ...d, project_id: project.id });
  }
  return json({ deployments: results, url: siteUrl(env, origin, project) });
}
async function promote(env, user, depId, origin) {
  const ref = await loadDeployment(env, user, depId);
  const d = await env.DB.prepare("SELECT status, number FROM deployments WHERE id = ?").bind(depId).first();
  if (d.status !== "ready") throw new HttpError(400, "Only successful deployments can be made live.");
  const project = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(ref.project_id).first();
  await env.DB.prepare("UPDATE projects SET active_deployment_id = ?, updated_at = ? WHERE id = ?").bind(depId, now(), project.id).run();
  await log(env, depId, "success", `Made live by ${user.email} (rollback/redeploy of version ${d.number}) at ${siteUrl(env, origin, project)}`);
  return json({ deployment: await getDeployment(env, depId, true) });
}
async function restoreToWorkspace(env, user, depId) {
  const ref = await loadDeployment(env, user, depId);
  const d = await env.DB.prepare("SELECT status, number FROM deployments WHERE id = ?").bind(depId).first();
  if (d.status !== "ready") throw new HttpError(400, "Only successful deployments can be restored.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM files WHERE project_id = ?").bind(ref.project_id),
    env.DB.prepare(
      "INSERT INTO files (project_id, path, hash, size, crc, content_type, updated_at) SELECT project_id, path, hash, size, crc, content_type, ?2 FROM deployment_files WHERE deployment_id = ?1"
    ).bind(depId, now()),
    env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), ref.project_id)
  ]);
  return json({ restored_version: d.number });
}
async function removeDeployment(env, user, depId) {
  const ref = await loadDeployment(env, user, depId);
  const p = await env.DB.prepare("SELECT active_deployment_id FROM projects WHERE id = ?").bind(ref.project_id).first();
  if (p.active_deployment_id === depId) throw new HttpError(400, "This deployment is live. Make another version live first.");
  await env.DB.prepare("DELETE FROM deployments WHERE id = ?").bind(depId).run();
  return json({ ok: true });
}

// src/domains.js
init_util();
var HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
var dto2 = (d) => ({
  id: d.id,
  project_id: d.project_id,
  hostname: d.hostname,
  verified: !!d.verified,
  project_name: d.project_name,
  project_slug: d.project_slug,
  txt_name: `_filelab-verify.${d.hostname}`,
  txt_value: `filelab-verify=${d.token}`,
  created_at: d.created_at,
  verified_at: d.verified_at
});
async function listAll(env, user) {
  const { results } = await env.DB.prepare(
    `SELECT d.*, p.name AS project_name, p.slug AS project_slug FROM domains d JOIN projects p ON p.id = d.project_id
     WHERE p.user_id = ? ORDER BY d.created_at DESC`
  ).bind(user.id).all();
  return json({ domains: results.map(dto2) });
}
async function add(request, env, project) {
  const b = await readJson(request);
  const hostname = String(b.hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!HOST_RE.test(hostname)) throw new HttpError(400, "Enter a valid domain such as www.example.com.");
  const reserved = [env.SITES_DOMAIN, env.APP_HOST].filter(Boolean);
  if (hostname.endsWith(".workers.dev") || reserved.some((r) => hostname === r || hostname.endsWith("." + r))) {
    throw new HttpError(400, "That hostname is managed by this platform and cannot be added as a custom domain.");
  }
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM domains WHERE project_id = ?").bind(project.id).first();
  if (n.n >= 5) throw new HttpError(403, "A website can have up to 5 custom domains.");
  const dup = await env.DB.prepare("SELECT 1 FROM domains WHERE project_id = ? AND hostname = ?").bind(project.id, hostname).first();
  if (dup) throw new HttpError(409, "That domain is already added to this website.");
  const id = uid("dm_");
  const token = b64url(crypto.getRandomValues(new Uint8Array(18)));
  await env.DB.prepare("INSERT INTO domains (id, project_id, hostname, token, verified, created_at) VALUES (?, ?, ?, ?, 0, ?)").bind(id, project.id, hostname, token, now()).run();
  const d = await env.DB.prepare("SELECT d.*, p.name AS project_name, p.slug AS project_slug FROM domains d JOIN projects p ON p.id = d.project_id WHERE d.id = ?").bind(id).first();
  return json({ domain: dto2(d) }, 201);
}
async function loadOwned(env, user, id) {
  const d = await env.DB.prepare(
    "SELECT d.*, p.name AS project_name, p.slug AS project_slug FROM domains d JOIN projects p ON p.id = d.project_id WHERE d.id = ? AND p.user_id = ?"
  ).bind(id, user.id).first();
  if (!d) throw new HttpError(404, "Domain not found.");
  return d;
}
async function txtRecords(name) {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: "application/dns-json" }
  });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const j = await res.json();
  return (j.Answer || []).filter((a) => a.type === 16).map((a) => String(a.data).replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
}
async function verify(env, user, id) {
  const d = await loadOwned(env, user, id);
  if (d.verified) return json({ domain: dto2(d) });
  let records;
  try {
    records = await txtRecords(`_filelab-verify.${d.hostname}`);
  } catch (e) {
    throw new HttpError(502, `Could not query DNS right now: ${e.message}. Try again in a minute.`);
  }
  if (!records.includes(`filelab-verify=${d.token}`)) {
    throw new HttpError(422, `TXT record not found yet. Add a TXT record named _filelab-verify.${d.hostname} with the value shown, then wait for DNS to propagate (can take a few minutes).`);
  }
  try {
    await env.DB.prepare("UPDATE domains SET verified = 1, verified_at = ? WHERE id = ?").bind(now(), id).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, "This domain is already verified by another website.");
    throw e;
  }
  return json({ domain: dto2(await loadOwned(env, user, id)) });
}
async function remove(env, user, id) {
  await loadOwned(env, user, id);
  await env.DB.prepare("DELETE FROM domains WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

// src/ai.js
init_util();
init_storage();
var FORMAT = `OUTPUT FORMAT (use exactly these markers, no markdown code fences anywhere):

<<<FILE: path/to/file.ext>>>
complete file contents
<<<END>>>

<<<EDIT: path/to/existing-file.ext>>>
<<<SEARCH>>>
exact existing text to find (must match the file character-for-character and appear in it)
<<<REPLACE>>>
the new text
<<<END>>>

<<<DELETE: path/to/file.ext>>>

After all blocks, write 1-3 plain sentences summarising what you did.`;
var RULES = `You are the AI website builder inside FileLab Hosting. You create and edit static websites made of plain HTML, CSS and JavaScript that run directly in a browser with no build step.

Rules:
- Use relative links only (style.css, js/app.js, about.html). Never start a path with "/".
- Everything must be self-contained: no frameworks, no CDN scripts, no remote images or fonts. Use CSS gradients, inline SVG and system font stacks.
- Mobile-first responsive layout, semantic HTML, accessible (alt text, labels, contrast, focus styles), modern professional design.
- Put shared styling in CSS files and behaviour in JS files rather than inlining everything.
- Never include API keys, secrets or tracking. If a form needs a backend, use a mailto: link or say plainly that it is a demo.
- File paths: lowercase, no spaces, only letters/numbers/dash/underscore/dot/slash.

${FORMAT}`;
var SYSTEM = {
  generate: `${RULES}

TASK TYPE: create a complete website from the user's description. Always produce index.html, style.css and script.js (plus extra pages or assets if the description needs them). Use FILE blocks only. Make it genuinely complete and polished, with real copy that fits the description (no lorem ipsum).`,
  edit: `${RULES}

TASK TYPE: modify the existing website according to the user's instruction. Prefer EDIT blocks (search/replace) so you only change what is needed; SEARCH text must be copied exactly from the current files and be specific enough to match once. Use FILE blocks only for new files or when most of a file changes. Do not output files that do not change.`,
  section: `${RULES}

TASK TYPE: regenerate ONE section of a page. The user names the file and describes the section. Change only that section; everything else in the file must stay byte-for-byte identical. Use EDIT blocks whose SEARCH text covers the whole existing section (or the part to change), and put the redesigned section in REPLACE. If the section needs new CSS or JS, add it with additional EDIT blocks or new files.`
};
function parseOps(text) {
  const ops = [];
  let pos = 0;
  const unfence = (s) => s.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```\s*$/, "");
  for (; ; ) {
    const re = /<<<(FILE|EDIT|DELETE): ([^\n>]+?)>>>\n?/g;
    re.lastIndex = pos;
    const h = re.exec(text);
    if (!h) break;
    const kind = h[1], path = h[2].trim();
    const p = h.index + h[0].length;
    if (kind === "DELETE") {
      ops.push({ kind, path });
      pos = p;
      continue;
    }
    if (kind === "FILE") {
      const end = text.indexOf("<<<END>>>", p);
      if (end < 0) {
        ops.push({ kind: "INCOMPLETE", path });
        break;
      }
      ops.push({ kind, path, content: unfence(text.slice(p, end).replace(/\n$/, "")) });
      pos = end + 9;
      continue;
    }
    const s = text.indexOf("<<<SEARCH>>>", p);
    const r = s < 0 ? -1 : text.indexOf("<<<REPLACE>>>", s);
    const e = r < 0 ? -1 : text.indexOf("<<<END>>>", r);
    if (e < 0) {
      ops.push({ kind: "INCOMPLETE", path });
      break;
    }
    const strip = (x) => x.replace(/^\n/, "").replace(/\n$/, "");
    ops.push({ kind, path, search: strip(text.slice(s + 12, r)), replace: strip(text.slice(r + 13, e)) });
    pos = e + 9;
  }
  const summary = text.replace(/<<<(FILE|EDIT)[\s\S]*?<<<END>>>/g, "").replace(/<<<DELETE:[^\n]*>>>/g, "").replace(/<<<[A-Z]+[^\n]*/g, "").trim().slice(0, 700);
  return { ops, summary };
}
function applyEdit(text, search, replace) {
  let i = text.indexOf(search);
  if (i >= 0) return text.slice(0, i) + replace + text.slice(i + search.length);
  const crlf = text.includes("\r\n");
  const t = text.replace(/\r\n/g, "\n");
  i = t.indexOf(search.replace(/\r\n/g, "\n"));
  if (i < 0) return null;
  const out = t.slice(0, i) + replace + t.slice(i + search.length);
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}
async function buildContext(env, project, mode, target, budget) {
  const rows = (await listFiles(env, project.id)).filter((r) => !isKeep(r.path));
  const list = rows.map((r) => `${r.path} (${r.size} bytes)`).join("\n") || "(no files yet)";
  if (mode === "generate") return { list, files: "" };
  const textRows = rows.filter((r) => isTextPath(r.path) && r.size < 6e4);
  textRows.sort((a, b) => (b.path === target) - (a.path === target) || /\.html?$/.test(b.path) - /\.html?$/.test(a.path) || a.path.localeCompare(b.path));
  let out = "";
  for (const r of textRows) {
    if (r.size > budget) continue;
    const row = await getFileRow(env, project.id, r.path);
    const t = await readText(env, project.id, row);
    out += `<file path="${r.path}">
${t}
</file>

`;
    budget -= t.length;
  }
  return { list, files: out };
}
async function streamCompletion(env, cfg, system, userMsg, onText) {
  const maxTokens = parseInt(env.AI_MAX_TOKENS || "8000", 10);
  const provider = cfg.provider;
  if (provider === "openai") {
    const res2 = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...cfg.key ? { authorization: `Bearer ${cfg.key}` } : {} },
      body: JSON.stringify({ model: cfg.model, stream: true, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: userMsg }] })
    });
    if (!res2.ok) {
      const t = await res2.text().catch(() => "");
      throw new Error(`The AI service returned an error (${res2.status}). ${t.slice(0, 200)}`);
    }
    const reader2 = res2.body.getReader(), dec2 = new TextDecoder();
    let buf2 = "", stop2 = null;
    const handle = (line) => {
      line = line.trim();
      if (!line.startsWith("data:")) return;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") return;
      let j;
      try {
        j = JSON.parse(d);
      } catch {
        return;
      }
      const piece = j.choices?.[0]?.delta?.content;
      if (piece) onText(piece);
      const fr = j.choices?.[0]?.finish_reason;
      if (fr) stop2 = fr === "length" ? "max_tokens" : fr;
    };
    for (; ; ) {
      const { done, value } = await reader2.read();
      if (done) break;
      buf2 += dec2.decode(value, { stream: true });
      let i;
      while ((i = buf2.indexOf("\n")) >= 0) {
        handle(buf2.slice(0, i));
        buf2 = buf2.slice(i + 1);
      }
    }
    handle(buf2);
    return stop2;
  }
  if (provider === "workers-ai") {
    const model = cfg.model;
    let stream;
    try {
      stream = await env.AI.run(model, { messages: [{ role: "system", content: system }, { role: "user", content: userMsg }], stream: true, max_tokens: maxTokens });
    } catch (e) {
      throw new Error(`Cloudflare Workers AI error: ${e && e.message ? e.message : e}`);
    }
    if (!(stream instanceof ReadableStream)) {
      const t = stream && (stream.response ?? stream.result?.response ?? stream.choices?.[0]?.message?.content);
      if (typeof t !== "string") throw new Error("Workers AI returned an unexpected response.");
      onText(t);
      return null;
    }
    const reader2 = stream.getReader(), dec2 = new TextDecoder();
    let buf2 = "", stop2 = null;
    const handle = (line) => {
      line = line.trim();
      if (!line.startsWith("data:")) return;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") return;
      let j;
      try {
        j = JSON.parse(d);
      } catch {
        return;
      }
      const piece = typeof j.response === "string" ? j.response : j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? "";
      if (piece) onText(piece);
      const fr = j.choices?.[0]?.finish_reason;
      if (fr) stop2 = fr === "length" ? "max_tokens" : fr;
    };
    for (; ; ) {
      const { done, value } = await reader2.read();
      if (done) break;
      buf2 += dec2.decode(value, { stream: true });
      let i;
      while ((i = buf2.indexOf("\n")) >= 0) {
        handle(buf2.slice(0, i));
        buf2 = buf2.slice(i + 1);
      }
    }
    handle(buf2);
    return stop2;
  }
  const res = await fetch(env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, stream: true, system, messages: [{ role: "user", content: userMsg }] })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`The AI provider returned an error (${res.status}). ${res.status === 401 ? "Check ANTHROPIC_API_KEY." : t.slice(0, 200)}`);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", stop = null;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = ev.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let j;
      try {
        j = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (j.type === "content_block_delta" && j.delta?.type === "text_delta") onText(j.delta.text);
      else if (j.type === "message_delta" && j.delta?.stop_reason) stop = j.delta.stop_reason;
      else if (j.type === "error") throw new Error(j.error?.message || "AI provider error");
    }
  }
  return stop;
}
async function handleAI(request, env, ctx, user, project) {
  const cfg = await aiConfig(env);
  const provider = cfg.provider;
  if (!provider) throw new HttpError(503, `The AI builder is not set up. ${cfg.reason}`);
  const b = await readJson(request, 2e4);
  const mode = ["generate", "edit", "section"].includes(b.mode) ? b.mode : null;
  const prompt = String(b.prompt || "").trim();
  const target = b.path ? cleanPath(String(b.path)) : "";
  if (!mode) throw new HttpError(400, "Choose generate, edit or section.");
  if (prompt.length < 3 || prompt.length > 4e3) throw new HttpError(400, "Describe what you want (3\u20134000 characters).");
  if (mode === "section" && !target) throw new HttpError(400, "Pick the file that contains the section.");
  const L = limits(env);
  const used = await env.DB.prepare("SELECT count FROM ai_usage WHERE user_id = ? AND day = ?").bind(user.id, today()).first();
  if ((used?.count || 0) >= L.aiDaily) throw new HttpError(429, `Daily AI limit reached (${L.aiDaily} runs). It resets at midnight UTC.`);
  await env.DB.prepare("INSERT INTO ai_usage (user_id, day, count) VALUES (?1, ?2, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1").bind(user.id, today()).run();
  const refund = () => env.DB.prepare("UPDATE ai_usage SET count = MAX(count - 1, 0) WHERE user_id = ? AND day = ?").bind(user.id, today()).run().catch(() => {
  });
  const context = await buildContext(env, project, mode, target, provider === "workers-ai" || provider === "openai" ? 32e3 : 9e4);
  let userMsg;
  if (mode === "generate") {
    userMsg = `Create a complete website for this request:

${prompt}

Site name: ${project.name}
Existing files (any file you output with the same path is overwritten):
${context.list}`;
  } else if (mode === "edit") {
    userMsg = `Current project files:

${context.files || "(none)"}
All file paths:
${context.list}

Change request:
${prompt}`;
  } else {
    userMsg = `Current project files:

${context.files}
All file paths:
${context.list}

The section to regenerate is in "${target}". Description / instruction:
${prompt}

Change only that section.`;
  }
  const te = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const send = (o) => w.write(te.encode(`data: ${JSON.stringify(o)}

`)).catch(() => {
  });
  const task = (async () => {
    try {
      await send({ type: "status", message: "Asking the AI\u2026" });
      let text = "", lastSent = 0;
      const stop = await streamCompletion(env, cfg, SYSTEM[mode], userMsg, async (d) => {
        text += d;
        if (text.length - lastSent > 1200) {
          lastSent = text.length;
          await send({ type: "progress", chars: text.length, blocks: (text.match(/<<<(FILE|EDIT|DELETE): /g) || []).length });
        }
      });
      await send({ type: "status", message: "Applying changes to your files\u2026" });
      const { ops, summary } = parseOps(text);
      const truncated = stop === "max_tokens" || ops.some((o) => o.kind === "INCOMPLETE");
      const real = ops.filter((o) => o.kind !== "INCOMPLETE");
      if (!real.length) {
        throw new Error(truncated ? "The AI ran out of space before finishing. Try a smaller request (for example one page or one section at a time)." : "The AI did not return any file changes. Try rephrasing your request.");
      }
      if (real.length > 60) throw new Error("The AI response touched too many files; try a narrower request.");
      const work = /* @__PURE__ */ new Map();
      const written = [], failed = [], deleted = [];
      const load = async (path) => {
        if (work.has(path)) return work.get(path);
        const row = await getFileRow(env, project.id, path);
        const entry = row ? { text: await readText(env, project.id, row), existed: true } : null;
        if (entry) work.set(path, entry);
        return entry;
      };
      for (const op of real) {
        let path;
        try {
          path = cleanPath(op.path);
          if (isKeep(path)) throw new Error("reserved name");
        } catch {
          failed.push({ path: op.path, reason: "Invalid file path." });
          continue;
        }
        if (op.kind === "FILE") {
          const prev = work.get(path) || await getFileRow(env, project.id, path);
          work.set(path, { text: op.content, existed: !!prev, changed: true });
        } else if (op.kind === "EDIT") {
          const cur = await load(path);
          if (!cur) {
            failed.push({ path, reason: "File does not exist." });
            continue;
          }
          const next = applyEdit(cur.text, op.search, op.replace);
          if (next === null) {
            failed.push({ path, reason: "The text the AI wanted to replace was not found in the file." });
            continue;
          }
          cur.text = next;
          cur.changed = true;
        } else if (op.kind === "DELETE") {
          if (await getFileRow(env, project.id, path)) {
            await env.DB.prepare("DELETE FROM files WHERE project_id = ? AND path = ?").bind(project.id, path).run();
            work.delete(path);
            deleted.push(path);
          }
        }
      }
      const items = [];
      for (const [path, e] of work) {
        if (!e.changed) continue;
        items.push({ path, bytes: te.encode(e.text) });
        written.push({ path, action: e.existed ? "updated" : "created" });
      }
      if (items.length) await putFiles(env, project.id, items);
      if (!items.length && !deleted.length) throw new Error(`None of the AI's changes could be applied. ${failed[0]?.reason || ""}`);
      await send({ type: "result", written, failed, deleted, summary, truncated, stop_reason: stop });
    } catch (e) {
      await refund();
      await send({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      await w.close().catch(() => {
      });
    }
  })();
  ctx.waitUntil(task);
  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" }
  });
}

// src/schema.js
var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (\n  id TEXT PRIMARY KEY,\n  email TEXT NOT NULL UNIQUE,\n  name TEXT,\n  password_hash TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS sessions (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  created_at INTEGER NOT NULL,\n  expires_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
  "CREATE TABLE IF NOT EXISTS projects (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  slug TEXT NOT NULL UNIQUE,\n  description TEXT DEFAULT '',\n  spa_fallback INTEGER NOT NULL DEFAULT 0,\n  active_deployment_id TEXT,\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)",
  "CREATE TABLE IF NOT EXISTS files (\n  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n  path TEXT NOT NULL,\n  hash TEXT NOT NULL,\n  size INTEGER NOT NULL,\n  crc INTEGER NOT NULL,\n  content_type TEXT NOT NULL,\n  updated_at INTEGER NOT NULL,\n  PRIMARY KEY (project_id, path)\n)",
  "CREATE TABLE IF NOT EXISTS deployments (\n  id TEXT PRIMARY KEY,\n  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n  user_id TEXT NOT NULL,\n  number INTEGER NOT NULL,\n  status TEXT NOT NULL,              \n  note TEXT DEFAULT '',\n  file_count INTEGER NOT NULL DEFAULT 0,\n  total_bytes INTEGER NOT NULL DEFAULT 0,\n  progress_done INTEGER NOT NULL DEFAULT 0,\n  progress_total INTEGER NOT NULL DEFAULT 0,\n  error TEXT,\n  created_at INTEGER NOT NULL,\n  finished_at INTEGER\n)",
  "CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id, number DESC)",
  "CREATE TABLE IF NOT EXISTS deployment_files (\n  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,\n  project_id TEXT NOT NULL,\n  path TEXT NOT NULL,\n  hash TEXT NOT NULL,\n  size INTEGER NOT NULL,\n  crc INTEGER NOT NULL,\n  content_type TEXT NOT NULL,\n  PRIMARY KEY (deployment_id, path)\n)",
  "CREATE TABLE IF NOT EXISTS deployment_logs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,\n  ts INTEGER NOT NULL,\n  level TEXT NOT NULL,               \n  message TEXT NOT NULL\n)",
  "CREATE INDEX IF NOT EXISTS idx_logs_dep ON deployment_logs(deployment_id, id)",
  "CREATE TABLE IF NOT EXISTS domains (\n  id TEXT PRIMARY KEY,\n  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n  hostname TEXT NOT NULL,\n  token TEXT NOT NULL,\n  verified INTEGER NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL,\n  verified_at INTEGER\n)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_verified ON domains(hostname) WHERE verified = 1",
  "CREATE INDEX IF NOT EXISTS idx_domains_host ON domains(hostname)",
  "CREATE TABLE IF NOT EXISTS usage_daily (\n  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n  day TEXT NOT NULL,\n  views INTEGER NOT NULL DEFAULT 0,\n  PRIMARY KEY (project_id, day)\n)",
  "CREATE TABLE IF NOT EXISTS rate_limits (\n  key TEXT PRIMARY KEY,\n  window_start INTEGER NOT NULL,\n  count INTEGER NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS ai_usage (\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  day TEXT NOT NULL,\n  count INTEGER NOT NULL DEFAULT 0,\n  PRIMARY KEY (user_id, day)\n)",
  "CREATE TABLE IF NOT EXISTS blobs (\n  key TEXT NOT NULL,\n  idx INTEGER NOT NULL,\n  data TEXT NOT NULL,\n  size INTEGER NOT NULL,\n  created_at INTEGER NOT NULL,\n  PRIMARY KEY (key, idx)\n)",
  "CREATE TABLE IF NOT EXISTS settings (\n  key TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n)"
];

// src/d1store.js
var CHUNK = 512 * 1024;
function toB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
var D1Store = class {
  constructor(db) {
    this.db = db;
  }
  async put(key, value) {
    let bytes;
    if (typeof value === "string") bytes = new TextEncoder().encode(value);
    else if (value instanceof Uint8Array) bytes = value;
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else bytes = new Uint8Array(await new Response(value).arrayBuffer());
    const now2 = Date.now();
    const ins = this.db.prepare("INSERT INTO blobs (key, idx, data, size, created_at) VALUES (?, ?, ?, ?, ?)");
    const stmts = [this.db.prepare("DELETE FROM blobs WHERE key = ?").bind(key)];
    if (!bytes.length) stmts.push(ins.bind(key, 0, "", 0, now2));
    for (let i = 0, n = 0; i < bytes.length; i += CHUNK, n++) stmts.push(ins.bind(key, n, toB64(bytes.subarray(i, i + CHUNK)), bytes.length, now2));
    for (let i = 0; i < stmts.length; i += 6) await this.db.batch(stmts.slice(i, i + 6));
    return { key, size: bytes.length };
  }
  async head(key) {
    const r = await this.db.prepare("SELECT size, created_at FROM blobs WHERE key = ? AND idx = 0").bind(key).first();
    return r ? { key, size: r.size, uploaded: new Date(r.created_at) } : null;
  }
  async get(key) {
    const { results } = await this.db.prepare("SELECT data, size, created_at FROM blobs WHERE key = ? ORDER BY idx").bind(key).all();
    if (!results.length) return null;
    const out = new Uint8Array(results[0].size);
    let o = 0;
    for (const r of results) {
      const u = fromB64(r.data);
      out.set(u, o);
      o += u.length;
    }
    return {
      key,
      size: out.length,
      uploaded: new Date(results[0].created_at),
      body: new Response(out).body,
      arrayBuffer: async () => out.buffer,
      text: async () => new TextDecoder().decode(out)
    };
  }
  async delete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (let i = 0; i < list.length; i += 50) {
      const part = list.slice(i, i + 50);
      await this.db.prepare(`DELETE FROM blobs WHERE key IN (${part.map(() => "?").join(",")})`).bind(...part).run();
    }
  }
  async list({ prefix = "", cursor, limit = 1e3 } = {}) {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const { results } = await this.db.prepare(
      "SELECT key, MAX(size) AS size, MIN(created_at) AS created_at FROM blobs WHERE substr(key, 1, ?1) = ?2 GROUP BY key ORDER BY key LIMIT ?3 OFFSET ?4"
    ).bind(prefix.length, prefix, limit + 1, offset).all();
    const truncated = results.length > limit;
    const page2 = results.slice(0, limit);
    return {
      objects: page2.map((r) => ({ key: r.key, size: r.size, uploaded: new Date(r.created_at) })),
      truncated,
      cursor: truncated ? String(offset + limit) : void 0
    };
  }
};

// src/index.js
var SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN"
};
function checkOrigin(request, url) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new HttpError(403, "Cross-origin request blocked.");
  if (!origin && request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-origin request blocked.");
}
async function api(request, env, ctx, url) {
  const path = url.pathname;
  const method = request.method;
  const origin = url.origin;
  checkOrigin(request, url);
  if (path === "/api/config" && method === "GET") {
    const L = limits(env);
    return json({
      allow_signup: String(env.ALLOW_SIGNUP).toLowerCase() !== "false",
      invite_required: !!env.INVITE_CODE,
      sites_domain: env.SITES_DOMAIN || null,
      ai_enabled: !!(await aiConfig(env)).provider,
      ai_provider: (await aiConfig(env)).provider,
      limits: { max_file_bytes: L.maxFileBytes, max_zip_bytes: L.maxZipBytes, max_project_bytes: L.maxProjectBytes, max_files: L.maxFiles, ai_daily: L.aiDaily }
    });
  }
  if (path === "/api/auth/signup" && method === "POST") return signup(request, env);
  if (path === "/api/auth/login" && method === "POST") return login(request, env);
  if (path === "/api/auth/logout" && method === "POST") return logout(request, env);
  const user = await requireUser(request, env);
  let m;
  if (path === "/api/auth/me" && method === "GET") return json({ user });
  if (path === "/api/admin/settings" && method === "GET") return adminSettingsView(env, user);
  if (path === "/api/admin/settings" && method === "PUT") return saveAdminSettings(request, env, user);
  if (path === "/api/overview" && method === "GET") return overview(env, user, origin);
  if (path === "/api/storage" && method === "GET") return storage(env, user);
  if (path === "/api/usage" && method === "GET") return usage(env, user);
  if (path === "/api/domains" && method === "GET") return listAll(env, user);
  if (path === "/api/deployments" && method === "GET") return json({ deployments: await recentDeployments(env, user, 50) });
  if (path === "/api/projects") {
    if (method === "GET") return listProjects(env, user, origin);
    if (method === "POST") return createProject(request, env, user, origin);
  }
  if (m = /^\/api\/deployments\/(d_[0-9a-f]+)(?:\/(promote|restore))?$/.exec(path)) {
    const [, id, action] = m;
    await loadDeployment(env, user, id);
    if (!action && method === "GET") return json({ deployment: await getDeployment(env, id, true) });
    if (!action && method === "DELETE") return removeDeployment(env, user, id);
    if (action === "promote" && method === "POST") return promote(env, user, id, origin);
    if (action === "restore" && method === "POST") return restoreToWorkspace(env, user, id);
  }
  if (m = /^\/api\/domains\/(dm_[0-9a-f]+)(?:\/(verify))?$/.exec(path)) {
    if (m[2] === "verify" && method === "POST") return verify(env, user, m[1]);
    if (!m[2] && method === "DELETE") return remove(env, user, m[1]);
  }
  if (m = /^\/api\/projects\/(p_[0-9a-f]+)(?:\/([a-z-/]+))?$/.exec(path)) {
    const project = await loadProject(env, user, m[1]);
    const sub = m[2] || "";
    if (!sub) {
      if (method === "GET") return json({ project: projectDto(env, origin, project) });
      if (method === "PATCH") return updateProject(request, env, project, origin);
      if (method === "DELETE") return deleteProject(env, project);
    }
    const url2 = url;
    if (sub === "files" && method === "GET") return handleList(env, project);
    if (sub === "file" && method === "GET") return handleRead(env, project, url2);
    if (sub === "file" && method === "PUT") return handleWrite(request, env, project, url2);
    if (sub === "files/delete" && method === "POST") return handleDelete(request, env, project);
    if (sub === "files/rename" && method === "POST") return handleRename(request, env, project);
    if (sub === "files/mkdir" && method === "POST") return handleMkdir(request, env, project);
    if (sub === "zip" && method === "POST") return handleZipImport(request, env, project, url2);
    if (sub === "download" && method === "GET") return handleDownload(env, project);
    if (sub === "preview-token" && method === "POST") return handlePreviewToken(env, project);
    if (sub === "deployments" && method === "GET") return listDeployments(env, project, origin);
    if (sub === "deployments" && method === "POST") return startDeploy(request, env, ctx, user, project, origin);
    if (sub === "domains" && method === "POST") return add(request, env, project);
    if (sub === "ai" && method === "POST") return handleAI(request, env, ctx, user, project);
    if (sub === "gc" && method === "POST") {
      const { gcProject: gcProject2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
      return json(await gcProject2(env, project.id));
    }
  }
  throw new HttpError(404, "Unknown API endpoint.");
}
var isLocalHost = (h) => h === "localhost" || h === "127.0.0.1" || h.endsWith(".workers.dev") || h.endsWith(".pages.dev") || h.endsWith(".localhost");
var setupDone = /* @__PURE__ */ new WeakMap();
var secrets = /* @__PURE__ */ new WeakMap();
async function secretFor(env) {
  if (env.APP_SECRET && env.APP_SECRET.length >= 16) return env.APP_SECRET;
  let p = secrets.get(env.DB);
  if (!p) {
    p = (async () => {
      const fresh = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('app_secret', ?) ON CONFLICT(key) DO NOTHING").bind(fresh).run();
      const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'app_secret'").first();
      return row.value;
    })().catch((e) => {
      secrets.delete(env.DB);
      throw e;
    });
    secrets.set(env.DB, p);
  }
  return p;
}
var stores = /* @__PURE__ */ new WeakMap();
function storeFor(db) {
  let s = stores.get(db);
  if (!s) {
    s = new D1Store(db);
    stores.set(db, s);
  }
  return s;
}
async function ensureSchema(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'blobs', 'settings')").first();
  if (row && row.n >= 3) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
}
function setup(env) {
  if (!env.DB) throw new HttpError(500, "Database is not connected. Add a D1 binding named DB (see README).");
  let p = setupDone.get(env.DB);
  if (!p) {
    p = ensureSchema(env).catch((e) => {
      setupDone.delete(env.DB);
      throw e;
    });
    setupDone.set(env.DB, p);
  }
  return p;
}
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    try {
      await setup(env);
      if (!env.SITES) env = { ...env, SITES: storeFor(env.DB) };
      env = { ...env, APP_SECRET: await secretFor(env) };
      const isAppHost = !!env.APP_HOST && host === env.APP_HOST.toLowerCase();
      if (!isAppHost && env.SITES_DOMAIN && host.endsWith("." + env.SITES_DOMAIN)) {
        const slug = host.slice(0, -(env.SITES_DOMAIN.length + 1));
        if (!slug.includes(".")) return withSecurity(await serveBySlug(env, ctx, request, slug, url.pathname, { sandbox: false }), false);
      }
      const isApp = isAppHost || isLocalHost(host) || env.SITES_DOMAIN && host === env.SITES_DOMAIN;
      if (!isApp) {
        const r = await serveByHost(env, ctx, request, host, url.pathname);
        if (r) return withSecurity(r, false);
        if (env.APP_HOST) return withSecurity(page(404, "Site not found", "No website is connected to this address."), false);
      }
      if (url.pathname.startsWith("/api/")) {
        try {
          return withSecurity(await api(request, env, ctx, url));
        } catch (e) {
          return withSecurity(errorResponse(e));
        }
      }
      let m;
      if (m = /^\/s\/([a-z0-9-]+)(\/.*)?$/.exec(url.pathname)) {
        if (!m[2]) return new Response(null, { status: 301, headers: { location: `${url.pathname}/${url.search}` } });
        return withSecurity(await serveBySlug(env, ctx, request, m[1], m[2], { sandbox: true }), false);
      }
      if (m = /^\/preview\/(.+)$/.exec(url.pathname)) {
        return withSecurity(await servePreview(env, ctx, request, m[1]), false);
      }
      return withSecurity(await env.ASSETS.fetch(request));
    } catch (e) {
      return withSecurity(errorResponse(e));
    }
  }
};
function withSecurity(res, frameable = true) {
  if (res.status === 301 || res.status === 302) return res;
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) if (!r.headers.has(k)) r.headers.set(k, v);
  if (!frameable) r.headers.delete("x-frame-options");
  return r;
}
function errorResponse(e) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error("Unhandled error:", e && e.stack ? e.stack : e);
  return json({ error: "Something went wrong on the server. Please try again." }, 500);
}
export {
  index_default as default
};
