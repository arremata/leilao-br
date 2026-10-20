-- Prepare bounded Caixa ingestion for larger, multi-UF catalogs.
-- Safe to run once in production before the worker version is deployed.

ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS photo_attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS photo_last_attempt_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
    id SERIAL PRIMARY KEY,
    source VARCHAR(32) NOT NULL,
    uf VARCHAR(2) NOT NULL,
    name VARCHAR(64) NOT NULL,
    cursor VARCHAR(128) NOT NULL DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ingestion_checkpoint UNIQUE (source, uf, name)
);

CREATE INDEX IF NOT EXISTS ix_ingestion_checkpoints_source
    ON ingestion_checkpoints (source);

CREATE INDEX IF NOT EXISTS ix_ingestion_checkpoints_uf
    ON ingestion_checkpoints (uf);

ALTER TABLE public.ingestion_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ingestion_checkpoints FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.ingestion_checkpoints_id_seq FROM anon, authenticated;
DROP POLICY IF EXISTS deny_supabase_data_api ON public.ingestion_checkpoints;
CREATE POLICY deny_supabase_data_api
    ON public.ingestion_checkpoints
    AS RESTRICTIVE FOR ALL TO anon, authenticated
    USING (false) WITH CHECK (false);
