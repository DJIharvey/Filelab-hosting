-- OPTIONAL. Run this SECOND, after 20261119_atomic_deployments.sql.
--
-- This role can SELECT published-site metadata only.
-- It does NOT receive Storage permissions. The filelab-sites bucket stays private.
-- The public service still downloads objects through the server process using a
-- server-side key (recommended: SUPABASE_SERVICE_ROLE_KEY). This migration has
-- not been tested with live Supabase Storage credentials.
--
-- RECOMMENDED FOR THE PUBLIC SERVICE:
-- Use SUPABASE_SERVICE_ROLE_KEY (server-side only, never in browser JavaScript).
--
-- OPTIONAL ADVANCED: SUPABASE_READER_KEY
-- Supabase does not automatically issue a JWT for a custom role.
-- To use a restricted key you must:
--   1. Run 20261119_atomic_deployments.sql first.
--   2. Run this file.
--   3. Create a JWT signed with your project's JWT secret
--      (Dashboard → Project Settings → API → JWT Secret) with a claim
--      { "role": "filelab_reader" }.
--   4. Set SUPABASE_READER_KEY to that JWT on the public service only.
-- If you skip this, leave SUPABASE_READER_KEY unset.
--
-- Do not put either key in frontend code.
--
-- Idempotent: safe to re-run. PostgreSQL has no CREATE ROLE IF NOT EXISTS,
-- so the role is created only when pg_roles does not already contain it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'filelab_reader') THEN
    CREATE ROLE filelab_reader NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO filelab_reader;
GRANT SELECT ON TABLE public.filelab_sites TO filelab_reader;
GRANT SELECT ON TABLE public.filelab_site_files TO filelab_reader;

-- Grant on the deployments table only if the atomic migration has already created it.
-- Running this file before the atomic migration is safe; the grant is skipped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'filelab_deployments'
  ) THEN
    GRANT SELECT ON TABLE public.filelab_deployments TO filelab_reader;
  END IF;
END $$;

-- No Storage policies are created. The bucket remains private.

COMMENT ON ROLE filelab_reader IS 'Read-only role for FileLab public metadata tables only. No Storage grants. JWT must be created manually if used.';
