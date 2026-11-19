import express from "express";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";
import mime from "mime-types";

const BUCKET = "filelab-sites";

export function safePublicPath(raw) {
  if (typeof raw !== "string") return null;
  if (raw.startsWith("/") || raw.startsWith("\\") || raw.includes("..")) return null;

  let s = raw;
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }

  if (/%2e%2e|%2f|%5c/i.test(raw) || s.includes("..") || s.includes("\0")) return null;

  s = s.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!s || s.length > 240) return null;

  const parts = s.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || (part.startsWith(".") && part !== ".well-known"))) return null;
  if (parts.some(part => part.includes("%"))) return null;

  return s;
}

function logError(msg, err) {
  const detail = err && err.message ? err.message : String(err || "");
  console.error("[filelab-public]", msg, detail.slice(0, 200));
}

async function serveFile(db, slug, path, res) {
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(slug)) return res.status(404).send("Site not found");

  const safe = safePublicPath(path);
  if (!safe) return res.status(400).send("Invalid path");

  const siteRes = await db.from("filelab_sites")
    .select("id,storage_prefix,status")
    .eq("slug", slug)
    .single();

  if (siteRes.error || !siteRes.data || siteRes.data.status !== "published") {
    return res.status(404).send("Site not found");
  }

  const site = siteRes.data;

  const fileRes = await db.from("filelab_site_files")
    .select("path,content_type")
    .eq("site_id", site.id)
    .eq("path", safe)
    .maybeSingle();

  if (fileRes.error || !fileRes.data) {
    return res.status(404).send("File not found");
  }

  const key = site.storage_prefix + "/" + fileRes.data.path;
  const dl = await db.storage.from(BUCKET).download(key);
  if (dl.error || !dl.data) {
    logError("storage download", dl.error);
    return res.status(502).send("Storage read failed");
  }

  const buf = Buffer.from(await dl.data.arrayBuffer());
  const ct = fileRes.data.content_type || mime.lookup(safe) || "application/octet-stream";

  res
    .status(200)
    .set("Content-Type", ct)
    .set("Cache-Control", "public, max-age=60")
    .set("X-Content-Type-Options", "nosniff")
    .set("Referrer-Policy", "strict-origin-when-cross-origin")
    .send(buf);
}

export function createPublicApp(dbClient) {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_READER_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const db = dbClient || createClient(url, key, { auth: { persistSession: false } });

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));

  app.get("/healthz", (_, res) => res.json({ ok: true, service: "FileLab Public Hosting" }));

  app.get("/s/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    await serveFile(db, slug, "index.html", res);
  });

  app.get("/s/:slug/*path", async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    let path = Array.isArray(req.params.path) ? req.params.path.join("/") : (req.params.path || "");
    if (!path || path === "/") path = "index.html";
    await serveFile(db, slug, path, res);
  });

  app.use((req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/admin")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(404).send("Not found");
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of ["SUPABASE_URL"]) {
    if (!process.env[k]) throw new Error("Missing " + k);
  }
  if (!process.env.SUPABASE_READER_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_READER_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }
  const app = createPublicApp();
  const port = process.env.PORT || 3001;
  app.listen(port, "0.0.0.0", () => console.log("FileLab Public Hosting ready on port", port));
}
