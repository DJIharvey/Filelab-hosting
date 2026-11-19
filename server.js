import express from "express";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";
import mime from "mime-types";
import crypto from "node:crypto";

const BUCKET = "filelab-sites";
const MAX_ZIP = 100 * 1024 * 1024;
const MAX_EXPANDED = 250 * 1024 * 1024;
const MAX_FILES = 1500;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const PUBLIC_ORIGIN = (process.env.PUBLIC_SITE_ORIGIN || "").replace(/\/+$/, "");

const sessions = new Map();

function makeLimiter(windowMs, max) {
  const hits = new Map();
  function check(key) {
    const now = Date.now();
    let arr = hits.get(key) || [];
    arr = arr.filter(t => now - t < windowMs);
    if (arr.length >= max) return false;
    arr.push(now);
    hits.set(key, arr);
    return true;
  }
  check.reset = () => hits.clear();
  return check;
}
const loginLimiter = makeLimiter(15 * 60 * 1000, 5);
const deployLimiter = makeLimiter(60 * 60 * 1000, 10);

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function logError(msg, err) {
  const detail = err && err.message ? err.message : String(err || "");
  console.error("[filelab]", msg, detail.slice(0, 200));
}

const equal = (a, b) => {
  a = Buffer.from(String(a));
  b = Buffer.from(String(b));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export function safeZipPath(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!s || s.length > 240 || s.includes("\0") || s.includes("..")) return null;
  try { s = decodeURIComponent(s); } catch { return null; }
  if (s.includes("..") || /%2e%2e/i.test(raw)) return null;
  const parts = s.split("/");
  if (parts.some(p => !p || p === "." || p === ".." || /[<>:"|?*\x00-\x1f]/.test(p))) return null;
  return s;
}

function isSymlink(entry) {
  const attr = entry.header?.externalFileAttributes || 0;
  return (attr >>> 16 & 0o170000) === 0o120000;
}

export function createAdminApp(dbClient) {
  const db = dbClient || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    }
  }));
  app.use(express.json({ limit: "140mb" }));
  app.use(express.static("public"));

  function publicUrl(slug) {
    if (!PUBLIC_ORIGIN) return `/s/${slug}/`;
    return `${PUBLIC_ORIGIN}/s/${slug}/`;
  }

  function requireSession(req, res, next) {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)filelab_session=([^;]+)/);
    const token = m ? decodeURIComponent(m[1]) : null;
    const sess = token && sessions.get(token);
    if (!sess || sess.expires < Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ error: "Sign in required" });
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin") || "";
      const host = req.get("host") || "";
      const expected = `${req.protocol}://${host}`;
      const custom = req.get("x-filelab-request") === "1";
      if (origin && origin !== expected && !custom) {
        return res.status(403).json({ error: "CSRF check failed" });
      }
      if (!origin && !custom) {
        return res.status(403).json({ error: "CSRF check failed" });
      }
    }
    req.sessionToken = token;
    next();
  }

  const slug = s => String(s || "site").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site";

  app.get("/healthz", (_, r) => r.json({ ok: true, service: "FileLab Hosting" }));

  app.get("/api/config", (req, res) => {
    res.json({ publicSiteOrigin: PUBLIC_ORIGIN || null });
  });

  app.post("/api/login", (req, res) => {
    const ip = clientIp(req);
    if (!loginLimiter(ip)) return res.status(429).json({ error: "Too many login attempts. Try again later." });
    const ok = equal(req.body?.password, process.env.FILELAB_ADMIN_PASSWORD);
    if (!ok) return res.status(401).json({ error: "Incorrect password" });

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { expires: Date.now() + SESSION_TTL_MS, created: Date.now() });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `filelab_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
    res.json({ ok: true });
  });

  app.post("/api/logout", requireSession, (req, res) => {
    sessions.delete(req.sessionToken);
    res.setHeader("Set-Cookie", "filelab_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    res.json({ ok: true });
  });

  app.get("/api/sites", requireSession, async (req, res) => {
    const x = await db.from("filelab_sites").select("id,slug,name,file_count,total_bytes,status,created_at").order("created_at", { ascending: false });
    if (x.error) {
      logError("list sites", x.error);
      return res.status(500).json({ error: "Could not list sites" });
    }
    const sites = (x.data || []).map(s => ({ ...s, publicUrl: s.status === "published" ? publicUrl(s.slug) : null }));
    res.json({ sites });
  });

  app.post("/api/sites", requireSession, async (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: "Enter a name" });
    const x = await db.from("filelab_sites").insert({
      name,
      slug: slug(req.body.slug || name) + "-" + crypto.randomBytes(3).toString("hex"),
      storage_prefix: "sites/" + crypto.randomUUID(),
      status: "draft"
    }).select("id,slug,name,status").single();
    if (x.error) {
      logError("create site", x.error);
      return res.status(500).json({ error: "Could not create site" });
    }
    res.status(201).json({ site: x.data });
  });

  app.post("/api/sites/:id/deploy", requireSession, async (req, res) => {
    const ip = clientIp(req);
    if (!deployLimiter(ip)) return res.status(429).json({ error: "Too many deployments. Try again later." });

    let buf;
    try { buf = Buffer.from(req.body.zipBase64, "base64"); } catch { return res.status(400).json({ error: "Invalid ZIP" }); }
    if (!buf?.length || buf.length > MAX_ZIP) return res.status(413).json({ error: "ZIP must be under 100 MB" });

    const siteRes = await db.from("filelab_sites").select("id,slug,storage_prefix,status").eq("id", req.params.id).single();
    if (siteRes.error || !siteRes.data) return res.status(404).json({ error: "Site not found" });
    const site = siteRes.data;

    let entries;
    try { entries = new AdmZip(buf).getEntries(); } catch { return res.status(400).json({ error: "Cannot read ZIP" }); }

    const files = [];
    const seen = new Set();
    let total = 0;
    for (const e of entries) {
      if (e.isDirectory) continue;
      if (isSymlink(e)) return res.status(400).json({ error: "Symlink entries are not allowed" });
      const p = safeZipPath(e.entryName);
      if (!p) return res.status(400).json({ error: "Unsafe ZIP path" });
      if (seen.has(p)) return res.status(400).json({ error: "Duplicate file path in ZIP" });
      seen.add(p);
      const data = e.getData();
      if (data.length > 50 * 1024 * 1024) return res.status(413).json({ error: "Individual file too large" });
      total += data.length;
      if (total > MAX_EXPANDED) return res.status(413).json({ error: "Expanded files exceed 250 MB" });
      files.push({ path: p, data });
    }
    if (!files.length || files.length > MAX_FILES) return res.status(400).json({ error: "ZIP must contain 1–1,500 files" });
    if (!files.some(f => f.path.toLowerCase() === "index.html")) return res.status(400).json({ error: "Put index.html at the ZIP root" });

    const prefix = site.storage_prefix + "/v-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex");
    const uploaded = [];
    try {
      for (const f of files) {
        const key = prefix + "/" + f.path;
        const u = await db.storage.from(BUCKET).upload(key, f.data, { contentType: mime.lookup(f.path) || "application/octet-stream" });
        if (u.error) throw new Error("upload failed");
        uploaded.push(key);
      }
    } catch (err) {
      logError("deploy upload", err);
      if (uploaded.length) {
        try { await db.storage.from(BUCKET).remove(uploaded); } catch { /* best effort */ }
      }
      return res.status(502).json({ error: "Upload failed. Previous version preserved." });
    }

    const rows = files.map(f => ({
      site_id: site.id,
      path: f.path,
      content_type: mime.lookup(f.path) || "application/octet-stream",
      size_bytes: f.data.length
    }));

    const del = await db.from("filelab_site_files").delete().eq("site_id", site.id);
    if (del.error) {
      logError("deploy delete old meta", del.error);
      try { await db.storage.from(BUCKET).remove(uploaded); } catch { /* */ }
      return res.status(500).json({ error: "Could not update site. Previous version preserved." });
    }

    const ins = await db.from("filelab_site_files").insert(rows);
    if (ins.error) {
      logError("deploy insert meta", ins.error);
      try { await db.storage.from(BUCKET).remove(uploaded); } catch { /* */ }
      return res.status(500).json({ error: "Could not update site. Previous version preserved." });
    }

    const up = await db.from("filelab_sites").update({
      storage_prefix: prefix,
      file_count: files.length,
      total_bytes: total,
      status: "published",
      deployed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", site.id);
    if (up.error) {
      logError("deploy update site", up.error);
      return res.status(500).json({ error: "Could not activate deployment. Previous version preserved." });
    }

    const url = publicUrl(site.slug);
    res.json({ ok: true, files: files.length, bytes: total, url, publicUrl: url });
  });

  return app;
}

export { sessions, loginLimiter, deployLimiter };

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FILELAB_ADMIN_PASSWORD"]) {
    if (!process.env[k]) throw new Error("Missing " + k);
  }
  const app = createAdminApp();
  const port = process.env.PORT || 3000;
  app.listen(port, "0.0.0.0", () => console.log("FileLab Admin ready on port", port));
}
