-- Optional restricted role for the public hosting service.
-- Run this in the Supabase SQL editor or via migrations.
-- The public service should prefer SUPABASE_READER_KEY (a JWT for this role)
-- over the service-role key. The bucket stays private.
-- This does not grant write access and does not weaken existing RLS.

CREATE ROLE IF NOT EXISTS filelab_reader NOLOGIN;

GRANT USAGE ON SCHEMA public TO filelab_reader;
GRANT SELECT ON TABLE public.filelab_sites TO filelab_reader;
GRANT SELECT ON TABLE public.filelab_site_files TO filelab_reader;

-- Storage remains private. Access is via the service role in the public
-- process only. No public policy is created.
--
-- To further restrict, create a storage policy that allows SELECT only for
-- the service role (already the default) and never for anon/authenticated.
-- Do not add a policy with USING (true) for the filelab-sites bucket.

COMMENT ON ROLE filelab_reader IS 'Read-only role for FileLab public metadata queries. No write grants.';
