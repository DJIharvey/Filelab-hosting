import express from "express";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";
import mime from "mime-types";
import crypto from "node:crypto";

for (const key of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FILELAB_ADMIN_PASSWORD"
]) {
  if (!process.env[key]) {
    throw new Error("Missing " + key);
  }
}

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const app = express();
const BUCKET = "filelab-sites";
const MAX = 100 * 1024 * 1024;

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "140mb" }));
app.use(express.static("public"));

const equal = (a, b) => {
  a = Buffer.from(String(a));
  b = Buffer.from(String(b));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function admin(req, res, next) {
  const header = req.get("authorization") || "";
  if (
    !equal(
      header.startsWith("Bearer ") ? header.slice(7) : "",
      process.env.FILELAB_ADMIN_PASSWORD
    )
  ) {
    return res.status(401).json({ error: "Sign in required" });
  }
  next();
}

const slug = (value) =>
  String(value || "site")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "site";

function safePath(value) {
  const path = String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const parts = path.split("/");
  return path.length <= 240 &&
    !parts.some((part) => !part || part === "." || part === "..")
    ? path
    : null;
}

app.get("/healthz", (_, res) =>
  res.json({ ok: true, service: "FileLab Hosting" })
);

app.post("/api/login", (req, res) =>
  equal(req.body?.password, process.env.FILELAB_ADMIN_PASSWORD)
    ? res.json({ token: process.env.FILELAB_ADMIN_PASSWORD })
    : res.status(401).json({ error: "Incorrect password" })
);

app.get("/api/sites", admin, async (req, res) => {
  const result = await db
    .from("filelab_sites")
    .select("id,slug,name,file_count,total_bytes,status,created_at")
    .order("created_at", { ascending: false });
  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }
  res.json({ sites: result.data });
});

app.post("/api/sites", admin, async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 100);
  if (!name) {
    return res.status(400).json({ error: "Enter a name" });
  }

  const result = await db
    .from("filelab_sites")
    .insert({
      name,
      slug: slug(req.body.slug || name) + "-" + crypto.randomBytes(3).toString("hex"),
      storage_prefix: "sites/" + crypto.randomUUID(),
      status: "draft"
    })
    .select("id,slug,name,status")
    .single();
  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }
  res.status(201).json({ site: result.data });
});

app.post("/api/sites/:id/deploy", admin, async (req, res) => {
  let buffer;
  try {
    buffer = Buffer.from(req.body.zipBase64, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid ZIP" });
  }
  if (!buffer?.length || buffer.length > MAX) {
    return res.status(413).json({ error: "ZIP must be under 100 MB" });
  }

  const site = await db
    .from("filelab_sites")
    .select("id,slug,storage_prefix")
    .eq("id", req.params.id)
    .single();
  if (site.error) {
    return res.status(404).json({ error: "Site not found" });
  }

  let entries;
  try {
    entries = new AdmZip(buffer).getEntries().filter((entry) => !entry.isDirectory);
  } catch {
    return res.status(400).json({ error: "Cannot read ZIP" });
  }
  if (!entries.length || entries.length > 1500) {
    return res.status(400).json({ error: "ZIP must contain 1–1,500 files" });
  }

  const files = [];
  let total = 0;
  for (const entry of entries) {
    const path = safePath(entry.entryName);
    if (!path) {
      return res.status(400).json({ error: "Unsafe ZIP path" });
    }
    const data = entry.getData();
    total += data.length;
    if (total > 250 * 1024 * 1024) {
      return res.status(413).json({ error: "Expanded files exceed 250 MB" });
    }
    files.push({ path, data });
  }

  if (!files.some((file) => file.path.toLowerCase() === "index.html")) {
    return res.status(400).json({ error: "Put index.html at the ZIP root" });
  }

  const prefix =
    site.data.storage_prefix +
    "/v-" +
    Date.now() +
    "-" +
    crypto.randomBytes(3).toString("hex");
  const uploaded = [];

  for (const file of files) {
    const key = prefix + "/" + file.path;
    const result = await db.storage.from(BUCKET).upload(key, file.data, {
      contentType: mime.lookup(file.path) || "application/octet-stream"
    });
    if (result.error) {
      if (uploaded.length) {
        await db.storage.from(BUCKET).remove(uploaded);
      }
      return res.status(502).json({ error: result.error.message });
    }
    uploaded.push(key);
  }

  const rows = files.map((file) => ({
    site_id: site.data.id,
    path: file.path,
    content_type: mime.lookup(file.path) || "application/octet-stream",
    size_bytes: file.data.length
  }));
  const deleted = await db
    .from("filelab_site_files")
    .delete()
    .eq("site_id", site.data.id);
  if (deleted.error) {
    return res.status(500).json({ error: deleted.error.message });
  }

  const inserted = await db.from("filelab_site_files").insert(rows);
  if (inserted.error) {
    return res.status(500).json({ error: inserted.error.message });
  }

  const updated = await db
    .from("filelab_sites")
    .update({
      storage_prefix: prefix,
      file_count: files.length,
      total_bytes: total,
      status: "published",
      deployed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", site.data.id);
  if (updated.error) {
    return res.status(500).json({ error: updated.error.message });
  }

  res.json({
    ok: true,
    files: files.length,
    bytes: total,
    url: "/s/" + site.data.slug + "/"
  });
});

app.get("/s/:slug/*path", async (req, res) => {
  const site = await db
    .from("filelab_sites")
    .select("id,storage_prefix,status")
    .eq("slug", req.params.slug)
    .single();
  if (site.error || site.data.status !== "published") {
    return res.status(404).send("Site not found");
  }

  let path = Array.isArray(req.params.path)
    ? req.params.path.join("/")
    : "index.html";
  path =
    safePath(decodeURIComponent(path || "index.html")) || "index.html";

  const file = await db
    .from("filelab_site_files")
    .select("path,content_type")
    .eq("site_id", site.data.id)
    .eq("path", path)
    .maybeSingle();
  if (file.error || !file.data) {
    return res.status(404).send("File not found");
  }

  const download = await db.storage
    .from(BUCKET)
    .download(site.data.storage_prefix + "/" + file.data.path);
  if (download.error) {
    return res.status(502).send("Storage read failed");
  }

  res
    .set("Content-Type", file.data.content_type)
    .set("Cache-Control", "public,max-age=60")
    .send(Buffer.from(await download.data.arrayBuffer()));
});

app.get("/s/:slug", (req, res) =>
  res.redirect("/s/" + encodeURIComponent(req.params.slug) + "/")
);

app.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log("FileLab Hosting ready")
);
