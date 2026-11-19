-- REQUIRED migration. Run this FIRST.
-- Additive only: does not drop or rewrite existing data.
--
-- Assumes the original FileLab tables already exist:
--   public.filelab_sites       (id, slug, name, storage_prefix, file_count,
--                               total_bytes, status, deployed_at, updated_at, created_at)
--   public.filelab_site_files  (site_id, path, content_type, size_bytes)
-- These were created by the initial FileLab setup. This migration does not recreate them.
--
-- After this migration, optionally run:
--   supabase/migrations/20261119_filelab_reader_role.sql

-- Version history (safe to add).
CREATE TABLE IF NOT EXISTS public.filelab_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  storage_prefix text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  file_count integer,
  total_bytes bigint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE INDEX IF NOT EXISTS filelab_deployments_site_idx
  ON public.filelab_deployments (site_id, created_at DESC);

-- Atomic, serialized switch for one site.
-- Locks the site row so two concurrent deployments of the same site
-- cannot interleave metadata updates and storage_prefix changes.
CREATE OR REPLACE FUNCTION public.filelab_activate_deployment(
  p_site_id uuid,
  p_storage_prefix text,
  p_files jsonb,
  p_file_count integer,
  p_total_bytes bigint
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Serialize concurrent activations for this site.
  -- The second caller waits until the first transaction commits or rolls back.
  PERFORM 1
  FROM public.filelab_sites
  WHERE id = p_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'site not found';
  END IF;

  -- Replace file metadata and point the site at the new prefix in this same transaction.
  -- If anything fails, the whole function rolls back and the previous version stays intact.
  DELETE FROM public.filelab_site_files WHERE site_id = p_site_id;

  INSERT INTO public.filelab_site_files (site_id, path, content_type, size_bytes)
  SELECT
    p_site_id,
    f->>'path',
    COALESCE(f->>'content_type', 'application/octet-stream'),
    (f->>'size_bytes')::bigint
  FROM jsonb_array_elements(COALESCE(p_files, '[]'::jsonb)) AS f;

  UPDATE public.filelab_sites
  SET
    storage_prefix = p_storage_prefix,
    file_count = p_file_count,
    total_bytes = p_total_bytes,
    status = 'published',
    deployed_at = now(),
    updated_at = now()
  WHERE id = p_site_id;

  INSERT INTO public.filelab_deployments (site_id, storage_prefix, status, file_count, total_bytes, activated_at)
  VALUES (p_site_id, p_storage_prefix, 'active', p_file_count, p_total_bytes, now());
END;
$$;

REVOKE ALL ON FUNCTION public.filelab_activate_deployment(uuid, text, jsonb, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filelab_activate_deployment(uuid, text, jsonb, integer, bigint) TO service_role;

-- If the optional reader role already exists, grant metadata read on the new table.
-- This does NOT grant access to the private Storage bucket.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'filelab_reader') THEN
    GRANT SELECT ON TABLE public.filelab_deployments TO filelab_reader;
  END IF;
END $$;

COMMENT ON FUNCTION public.filelab_activate_deployment IS
  'Locks the site row, then atomically replaces file metadata and activates a new storage prefix. Concurrent deploys of the same site are serialized. Failure leaves the previous deployment intact.';
