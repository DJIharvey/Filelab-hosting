-- Additive migration: atomic deployment activation.
-- Does not drop or rewrite existing data.
-- Run in the Supabase SQL editor after the reader-role migration (if used).

-- Optional version history (safe to add).
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

-- Atomic switch: replace file metadata and point the site at the new prefix
-- in a single transaction. If anything fails, the previous version is unchanged.
CREATE OR REPLACE FUNCTION public.filelab_activate_deployment(
  p_site_id uuid,
  p_storage_prefix text,
  p_files jsonb,
  p_file_count integer,
  p_total_bytes bigint
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert new file rows into a temp approach: delete+insert is atomic inside this function.
  -- The previous rows remain until this function commits successfully.
  DELETE FROM public.filelab_site_files WHERE site_id = p_site_id;

  INSERT INTO public.filelab_site_files (site_id, path, content_type, size_bytes)
  SELECT
    p_site_id,
    f->>'path',
    COALESCE(f->>'content_type', 'application/octet-stream'),
    (f->>'size_bytes')::bigint
  FROM jsonb_array_elements(p_files) AS f;

  UPDATE public.filelab_sites
  SET
    storage_prefix = p_storage_prefix,
    file_count = p_file_count,
    total_bytes = p_total_bytes,
    status = 'published',
    deployed_at = now(),
    updated_at = now()
  WHERE id = p_site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'site not found';
  END IF;

  -- Record the successful activation (best-effort history).
  INSERT INTO public.filelab_deployments (site_id, storage_prefix, status, file_count, total_bytes, activated_at)
  VALUES (p_site_id, p_storage_prefix, 'active', p_file_count, p_total_bytes, now());
END;
$$;

-- Reader role (if created) may only SELECT. No execute on the activator.
REVOKE ALL ON FUNCTION public.filelab_activate_deployment(uuid, text, jsonb, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filelab_activate_deployment(uuid, text, jsonb, integer, bigint) TO service_role;

COMMENT ON FUNCTION public.filelab_activate_deployment IS
  'Atomically replaces site file metadata and activates a new storage prefix. Failure leaves the previous deployment intact.';
