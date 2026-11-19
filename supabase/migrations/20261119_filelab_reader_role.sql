-- Optional restricted Postgres role for metadata reads.
-- The Storage bucket stays private. No public SELECT policy is created.
--
-- RECOMMENDED FOR THE PUBLIC SERVICE:
-- Use SUPABASE_SERVICE_ROLE_KEY (server-side only, never in browser JavaScript).
-- The public service process is the only thing that talks to Supabase.
-- The bucket remains private; files are streamed through public-server.js.
--
-- OPTIONAL ADVANCED: SUPABASE_READER_KEY
-- Supabase does not automatically issue a JWT for a custom role.
-- To use a restricted key you must:
--   1. Run the SQL below.
--   2. Create a JWT signed with your project's JWT secret
--      (Dashboard → Project Settings → API → JWT Secret) with a claim
--      { "role": "filelab_reader" }.
--   3. Set SUPABASE_READER_KEY to that JWT on the public service only.
-- If you do not do this, leave SUPABASE_READER_KEY unset and use the
-- service-role key on the public service (still server-side only).
--
-- Do not put either key in frontend code or environment variables that
-- are exposed to the browser.

CREATE ROLE IF NOT EXISTS filelab_reader NOLOGIN;

GRANT USAGE ON SCHEMA public TO filelab_reader;
GRANT SELECT ON TABLE public.filelab_sites TO filelab_reader;
GRANT SELECT ON TABLE public.filelab_site_files TO filelab_reader;
GRANT SELECT ON TABLE public.filelab_deployments TO filelab_reader;

-- Storage remains private. Access is only through the server process
-- using a server-side key. Do not add a policy with USING (true)
-- on the filelab-sites bucket.

COMMENT ON ROLE filelab_reader IS 'Read-only role for FileLab public metadata. No write grants. JWT must be created manually if used.';
