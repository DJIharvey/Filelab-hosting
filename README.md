# FileLab Hosting MVP

FileLab owns website uploads, publishing records, public site routes, and file serving. Render runs the Node.js server only. Supabase Postgres stores metadata and the private `filelab-sites` bucket stores site files.

## Required Render environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only; never put in browser code or commit it)
- `FILELAB_ADMIN_PASSWORD` (choose a strong password)

Build command: `npm install`
Start command: `npm start`
Health check: `/healthz`
Node: 20+

Render's normal Web Service deployment requires a Git repository. This archive has not been deployed yet.

## Local run
`npm install` then set the three environment variables and run `npm start`.

## Publish
Sign in, create a website, then upload a ZIP with `index.html` at its root. Published URL: `/s/<slug>/`.

## MVP limits
ZIP <=100 MB; expanded content <=250 MB; max 1,500 files. Single admin password; no custom domains, teams, rollback UI, build pipelines, or Git deploys yet. Free-tier quotas, bandwidth, and sleeping limits apply; hosting is not unlimited.
