# FileLab Hosting MVP

FileLab owns website uploads, publishing records, and public site serving. There are two separate Node.js services:

1. **Admin / Dashboard service** (`server.js`) — login, site management, ZIP deploy, Supabase metadata updates. Serves only the FileLab dashboard. Never serves uploaded HTML/JS.
2. **Public hosting service** (`public-server.js`) — read-only serving of published websites from Supabase Storage. No dashboard, no admin APIs, no uploads.

Supabase Postgres stores metadata (`filelab_sites`, `filelab_site_files`). The private `filelab-sites` bucket stores site files. The service-role key is server-side only and is never sent to the browser.

## Environment variables

### Admin service (server.js)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only)
- `FILELAB_ADMIN_PASSWORD` (choose a strong password)
- `PUBLIC_SITE_ORIGIN` — full origin of the public service, e.g. `https://sites.yourdomain.com` or `http://localhost:3001` (no trailing slash)

### Public hosting service (public-server.js)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only)

Do not make the storage bucket public. Do not put the service-role key in frontend code.

## Local development

```bash
npm install

# Terminal 1 – admin (dashboard) on :3000
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export FILELAB_ADMIN_PASSWORD=...
export PUBLIC_SITE_ORIGIN=http://localhost:3001
npm start

# Terminal 2 – public hosting on :3001
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm run start:public
```

Dashboard: http://localhost:3000  
Published sites: http://localhost:3001/s/<slug>/

## Render deployment (two Web Services)

Create two separate Render Web Services from this repository (or the same Git branch).

**Admin service**
- Build command: `npm install`
- Start command: `npm start` (or `node server.js`)
- Environment: the four variables listed above for admin. Set `PUBLIC_SITE_ORIGIN` to the public service’s Render URL (e.g. `https://filelab-public.onrender.com`).

**Public hosting service**
- Build command: `npm install`
- Start command: `npm run start:public` (or `node public-server.js`)
- Environment: only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

After deploy, open the admin URL, sign in, create a site, upload a ZIP with `index.html` at the root. The dashboard will show the public URL using `PUBLIC_SITE_ORIGIN`.

## Tests

```bash
npm test
```

## MVP limits

ZIP ≤100 MB; expanded content ≤250 MB; max 1,500 files. Single admin password; no custom domains, teams, rollback UI, build pipelines, or Git deploys yet.

The advanced dashboard UI is preserved as `public/app-advanced.js` for future work. The active dashboard is the simple one that matches the current backend.
