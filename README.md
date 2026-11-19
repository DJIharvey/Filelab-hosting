# FileLab Hosting MVP

FileLab owns website uploads, publishing records, and public site serving. There are two separate Node.js services:

1. **Admin / Dashboard service** (`server.js`) — login, site management, ZIP deploy, Supabase metadata updates. Serves only the FileLab dashboard. Never serves uploaded HTML/JS.
2. **Public hosting service** (`public-server.js`) — read-only serving of published websites from Supabase Storage. No dashboard, no admin APIs, no uploads.

## Security notes (Phase 2)

- Admin authentication uses short-lived HttpOnly `SameSite=Strict` session cookies. The plaintext password is never returned as a token.
- Sessions expire after 8 hours. Logout revokes the session immediately.
- Mutating requests require a same-origin `Origin` header or `X-FileLab-Request: 1` (CSRF protection).
- Login is rate-limited (5 attempts / 15 min per IP). Deploy is rate-limited (10 / hour per IP).
- ZIP uploads are validated for path traversal, symlinks, duplicate paths, and size limits before any storage write. A failed deployment leaves the previous published version intact.
- Admin dashboard has a strict Content-Security-Policy. Public sites do not inherit it.
- Internal Supabase errors are not returned to clients.
- The public service never exposes credentials. It can use `SUPABASE_READER_KEY` (restricted) or falls back to the service-role key only for private bucket downloads of published objects. The bucket stays private.

## Environment variables

### Admin service (`server.js`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only)
- `FILELAB_ADMIN_PASSWORD` (strong password)
- `PUBLIC_SITE_ORIGIN` — full origin of the public service, e.g. `https://sites.example.com` (no trailing slash)
- `NODE_ENV=production` (enables Secure cookie flag)

### Public hosting service (`public-server.js`)
- `SUPABASE_URL`
- `SUPABASE_READER_KEY` (preferred; JWT or key for a read-only role) **or**
- `SUPABASE_SERVICE_ROLE_KEY` (fallback; used only for storage downloads of published files)

Do not make the `filelab-sites` bucket public. Do not put any key in frontend code.

## Supabase migration

See `supabase/migrations/20261119_filelab_reader_role.sql`.

It creates a `filelab_reader` role with SELECT on the metadata tables only. It does not grant write access and does not make the bucket public. For full read-only storage access you still need either the service role (scoped to the public process) or a carefully written storage policy; Supabase Storage does not provide a simple “read-only service role” key.

## Local development

```bash
npm install

# Terminal 1 – admin on :3000
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export FILELAB_ADMIN_PASSWORD=...
export PUBLIC_SITE_ORIGIN=http://localhost:3001
npm start

# Terminal 2 – public on :3001
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...   # or SUPABASE_READER_KEY
npm run start:public
```

## Render deployment (two Web Services)

Create two separate Render Web Services from this branch.

**Admin service**
- Build: `npm install`
- Start: `npm start`
- Environment: the four admin variables above. Set `NODE_ENV=production`.

**Public hosting service**
- Build: `npm install`
- Start: `npm run start:public`
- Environment: `SUPABASE_URL` plus either `SUPABASE_READER_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.

## Tests

```bash
npm test
```

## MVP limits

ZIP ≤100 MB; expanded ≤250 MB; max 1,500 files. Single admin password; no custom domains, teams, or Git deploys yet. Sessions are in-memory (lost on restart / not shared across instances).
