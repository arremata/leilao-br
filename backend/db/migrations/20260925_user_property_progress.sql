-- Per-account progress in the "O que fazer agora" guide of each property.
-- Only the completed step identifiers are stored; step wording stays in the
-- frontend's editorial content file.
CREATE TABLE IF NOT EXISTS user_property_progress (
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id      BIGINT NOT NULL,
  completed_steps  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

-- Account data is served only by the Argos backend (OD-004). Close the table to
-- Supabase's automatic Data API exactly like 20260925_harden_public_rls.sql.
ALTER TABLE public.user_property_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.user_property_progress FROM anon, authenticated;
DROP POLICY IF EXISTS deny_supabase_data_api ON public.user_property_progress;
CREATE POLICY deny_supabase_data_api ON public.user_property_progress
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
