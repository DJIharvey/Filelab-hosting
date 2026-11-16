-- Stores only hashes of server-issued admin session tokens; raw tokens and passwords
-- must remain out of database records.
CREATE TABLE IF NOT EXISTS public.filelab_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone NULL
);

ALTER TABLE public.filelab_admin_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.filelab_admin_sessions FROM anon, authenticated;

-- The unique constraint creates an index for token_hash lookups.
