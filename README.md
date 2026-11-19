# FileLab Hosting MVP

FileLab owns website uploads, publishing records, and public site serving. There are two separate Node.js services:

1. **Admin / Dashboard service** (`server.js`) — login, site management, ZIP deploy, Supabase metadata updates. Serves only the FileLab dashboard. Never serves uploaded HTML/JS.
2. **Public hosting service** (`public-server.js`) — read-only serving of published websites from Supabase Storage. No dashboard, no admin APIs, no uploads.

## Security notes (Phase 2)

- Admin authentication uses short-lived HttpOnly `SameSite=Strict` session cookies. The plaintext password is never returned as a token.
- Sessions expire after 8 hours. Logout revokes the session immediately.
- Mutating requests require a same-origin `Origin` header or `X-FileLab-Request: 1` (CSRF protection).
- Login is rate-limited (5 attempts / 15 min per IP). Deploy is rate-limited (10 / hour per IP). Limits are in-memory, reset on process restart, and are not shared across instances.
- On Render set `TRUST_PROXY=1` so the platform-provided `X-Forwarded-For` is used. Arbitrary client-supplied `X-Forwarded-For` values are ignored when `TRUST_PROXY` is unset.
- Deployments are versioned. All new files are uploaded and validated first. The active version is switched with a single database RPC (`filelab_activate_deployment`). If any step fails, the previous deployment (metadata + files) remains fully accessible.
- Admin dashboard has a strict Content-Security-Policy. Public sites do not inherit it.
- Internal Supabase errors are not returned to clients.
- The public service never exposes credentials to the browser. Recommended: use `SUPABASE_SERVICE_ROLE_KEY` server-side only. Optional: `SUPABASE_READER_KEY` (see migration notes). The `filelab-sites` bucket stays private.

## Environment variables

### Admin service (`server.js`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only)
- `FILELAB_ADMIN_PASSWORD` (strong password)
- `PUBLIC_SITE_ORIGIN` — full origin of the public service, e.g. `https://sites.example.com` (no trailing slash)
- `NODE_ENV=production` (enables Secure cookie flag)
- `TRUST_PROXY=1` (required on Render so rate limits see the real client IP)

### Public hosting service (`public-server.js`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (recommended; server-side only; never in browser code) **or**
- `SUPABASE_READER_KEY` (optional advanced; see below)

Do not make the `filelab-sites` bucket public. Do not put any key in frontend code.

### Generating SUPABASE_READER_KEY (optional)
Supabase does not automatically issue a JWT for a custom role. To use a restricted key:

1. Run `supabase/migrations/20261119_filelab_reader_role.sql` in the SQL editor.
2. Create a JWT signed with your project's JWT secret (Dashboard → Project Settings → API → JWT Secret) whose payload includes `"role": "filelab_reader"`.
3. Set `SUPABASE_READER_KEY` to that JWT on the public service only.

If you skip this, leave `SUPABASE_READER_KEY` unset and use `SUPABASE_SERVICE_ROLE_KEY` on the public service. The bucket remains private either way; the public process is the only reader.

## Supabase migrations

1. `supabase/migrations/20261119_filelab_reader_role.sql` — optional read-only role (SELECT on metadata only).
2. `supabase/migrations/20261119_atomic_deployments.sql` — **required** for atomic deploys. Creates `filelab_deployments` and the `filelab_activate_deployment` RPC. Additive; does not drop existing data.

The public service reads published site metadata and file rows, then downloads objects from the private bucket using the server-side key. No browser code ever sees the key.

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
- Environment: the admin variables above. Set `NODE_ENV=production` and `TRUST_PROXY=1`.

**Public hosting service**
- Build: `npm install`
- Start: `npm run start:public`
- Environment: `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` (or optional `SUPABASE_READER_KEY`). Set `TRUST_PROXY=1` if you add rate limits later.

## Tests

```bash
npm test
```

## MVP limits

ZIP ≤100 MB; expanded content ≤250 MB; max 1,500 files. Single admin password; no custom domains, teams, rollback UI, build pipelines, or Git deploys yet.
