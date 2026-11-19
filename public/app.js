let token = "";
let publicOrigin = "";

const $ = id => document.getElementById(id);
const note = t => { $("notice").textContent = t; };

async function api(url, opt = {}) {
  const r = await fetch(url, {
    ...opt,
    headers: { ...(opt.headers || {}), ...(token ? { Authorization: "Bearer " + token } : {}) }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}

async function loadConfig() {
  try {
    const cfg = await api("/api/config");
    publicOrigin = (cfg.publicSiteOrigin || "").replace(/\/+$/, "");
  } catch { /* ignore */ }
}

$("loginForm").onsubmit = async e => {
  e.preventDefault();
  try {
    token = (await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value })
    })).token;
    $("login").hidden = true;
    $("dash").hidden = false;
    await loadConfig();
    load();
  } catch (x) {
    $("err").textContent = x.message;
  }
};

$("logout").onclick = () => {
  token = "";
  $("dash").hidden = true;
  $("login").hidden = false;
};

$("create").onsubmit = async e => {
  e.preventDefault();
  try {
    await api("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: $("name").value })
    });
    $("name").value = "";
    note("Website created. Add a ZIP below to publish.");
    load();
  } catch (x) { note(x.message); }
};

async function load() {
  try {
    const { sites } = await api("/api/sites");
    $("sites").replaceChildren();
    for (const s of sites) {
      const a = document.createElement("article");
      const h = document.createElement("h3");
      const p = document.createElement("p");
      const link = document.createElement("a");
      const f = document.createElement("input");
      const b = document.createElement("button");

      h.textContent = s.name;
      p.textContent = s.status + " · " + (s.file_count || 0) + " files";

      const pub = s.publicUrl || (publicOrigin ? publicOrigin + "/s/" + s.slug + "/" : "/s/" + s.slug + "/");
      link.href = pub;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open published site";

      f.type = "file";
      f.accept = ".zip";
      b.textContent = "Publish ZIP";
      b.style.marginLeft = "8px";
      b.onclick = async () => {
        if (!f.files[0]) return note("Choose a ZIP first");
        if (f.files[0].size > 100 * 1024 * 1024) return note("ZIP exceeds 100 MB");
        b.disabled = true;
        try {
          const data = await new Promise((ok, no) => {
            const r = new FileReader();
            r.onload = () => ok(r.result.split(",")[1]);
            r.onerror = no;
            r.readAsDataURL(f.files[0]);
          });
          const out = await api("/api/sites/" + s.id + "/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ zipBase64: data })
          });
          note("Published " + out.files + " files: " + out.url);
          load();
        } catch (x) {
          note(x.message);
          b.disabled = false;
        }
      };
      a.append(h, p, link, document.createElement("br"), f, b);
      $("sites").append(a);
    }
  } catch (x) { note(x.message); }
}
