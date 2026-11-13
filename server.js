import express from "express";
import helmet from "helmet";
import {createClient} from "@supabase/supabase-js";
import AdmZip from "adm-zip";
import mime from "mime-types";
import crypto from "node:crypto";

for (const k of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","FILELAB_ADMIN_PASSWORD"]) if (!process.env[k]) throw new Error("Missing "+k);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const app=express(), BUCKET="filelab-sites", MAX=100*1024*1024;
app.disable("x-powered-by"); app.use(helmet({contentSecurityPolicy:false})); app.use(express.json({limit:"140mb"})); app.use(express.static("public"));
const equal=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b)};
function admin(req,res,next){const h=req.get("authorization")||"";if(!equal(h.startsWith("Bearer ")?h.slice(7):"",process.env.FILELAB_ADMIN_PASSWORD))return res.status(401).json({error:"Sign in required"});next()}
const slug=s=>String(s||"site").toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"site";
function safePath(s){s=String(s).replace(/\\/g,"/").replace(/^\/+/,"");const p=s.split("/");return s.length<=240&&!p.some(x=>!x||x==="."||x==="..")?s:null}
app.get("/healthz",(_,r)=>r.json({ok:true,service:"FileLab Hosting"}));
app.post("/api/login",(q,r)=>equal(q.body?.password,process.env.FILELAB_ADMIN_PASSWORD)?r.json({token:process.env.FILELAB_ADMIN_PASSWORD}):r.status(401).json({error:"Incorrect password"}));
app.get("/api/sites",admin,async(q,r)=>{const x=await db.from("filelab_sites").select("id,slug,name,file_count,total_bytes,status,created_at").order("created_at",{ascending:false});if(x.error)return r.status(500).json({error:x.error.message});r.json({sites:x.data})});
app.post("/api/sites",admin,async(q,r)=>{const name=String(q.body?.name||"").trim().slice(0,100);if(!name)return r.status(400).json({error:"Enter a name"});const x=await db.from("filelab_sites").insert({name,slug:slug(q.body.slug||name)+"-"+crypto.randomBytes(3).toString("hex"),storage_prefix:"sites/"+crypto.randomUUID(),status:"draft"}).select("id,slug,name,status").single();if(x.error)return r.status(500).json({error:x.error.message});r.status(201).json({site:x.data})});
app.post("/api/sites/:id/deploy",admin,async(q,r)=>{
 let buf;try{buf=Buffer.from(q.body.zipBase64,"base64")}catch{return r.status(400).json({error:"Invalid ZIP"})}
 if(!buf?.length||buf.length>MAX)return r.status(413).json({error:"ZIP must be under 100 MB"});
 const s=await db.from("filelab_sites").select("id,slug,storage_prefix").eq("id",q.params.id).single();if(s.error)return r.status(404).json({error:"Site not found"});
 let entries;try{entries=new AdmZip(buf).getEntries().filter(e=>!e.isDirectory)}catch{return r.status(400).json({error:"Cannot read ZIP"})}
 if(!entries.length||entries.length>1500)return r.status(400).json({error:"ZIP must contain 1–1,500 files"});
 const files=[];let total=0;for(const e of entries){const p=safePath(e.entryName);if(!p)return r.status(400).json({error:"Unsafe ZIP path"});const data=e.getData();total+=data.length;if(total>250*1024*1024)return r.status(413).json({error:"Expanded files exceed 250 MB"});files.push({path:p,data})}
 if(!files.some(f=>f.path.toLowerCase()==="index.html"))return r.status(400).json({error:"Put index.html at the ZIP root"});
 const prefix=s.data.storage_prefix+"/v-"+Date.now()+"-"+crypto.randomBytes(3).toString("hex"), uploaded=[];
 for(const f of files){const key=prefix+"/"+f.path;const u=await db.storage.from(BUCKET).upload(key,f.data,{contentType:mime.lookup(f.path)||"application/octet-stream"});if(u.error){if(uploaded.length)await db.storage.from(BUCKET).remove(uploaded);return r.status(502).json({error:u.error.message})}uploaded.push(key)}
 const rows=files.map(f=>({site_id:s.data.id,path:f.path,content_type:mime.lookup(f.path)||"application/octet-stream",size_bytes:f.data.length}));
 const del=await db.from("filelab_site_files").delete().eq("site_id",s.data.id);if(del.error)return r.status(500).json({error:del.error.message});
 const ins=await db.from("filelab_site_files").insert(rows);if(ins.error)return r.status(500).json({error:ins.error.message});
 const up=await db.from("filelab_sites").update({storage_prefix:prefix,file_count:files.length,total_bytes:total,status:"published",deployed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",s.data.id);if(up.error)return r.status(500).json({error:up.error.message});
 r.json({ok:true,files:files.length,bytes:total,url:"/s/"+s.data.slug+"/"});
});
app.get("/s/:slug/*path",async(q,r)=>{
 const s=await db.from("filelab_sites").select("id,storage_prefix,status").eq("slug",q.params.slug).single();if(s.error||s.data.status!=="published")return r.status(404).send("Site not found");
 let p=Array.isArray(q.params.path)?q.params.path.join("/"):"index.html";p=safePath(decodeURIComponent(p||"index.html"))||"index.html";
 let f=await db.from("filelab_site_files").select("path,content_type").eq("site_id",s.data.id).eq("path",p).maybeSingle();if(f.error||!f.data)return r.status(404).send("File not found");
 const d=await db.storage.from(BUCKET).download(s.data.storage_prefix+"/"+f.data.path);if(d.error)return r.status(502).send("Storage read failed");
 r.set("Content-Type",f.data.content_type).set("Cache-Control","public,max-age=60").send(Buffer.from(await d.data.arrayBuffer()));
});
app.get("/s/:slug",(q,r)=>r.redirect("/s/"+encodeURIComponent(q.params.slug)+"/"));
app.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("FileLab Hosting ready"));
