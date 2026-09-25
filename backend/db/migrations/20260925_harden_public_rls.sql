-- Argos exposes catalog and account data only through its authenticated backend.
-- Keep Supabase's automatic Data API closed while preserving postgres and
-- service_role access for the backend, ingestion jobs, and administration.

DO $migration$
DECLARE
  target_table text;
  target_tables CONSTANT text[] := ARRAY[
    'properties',
    'property_events',
    'enrichments',
    'regional_market_prices',
    'regional_market_comparables',
    'market_reference_jobs',
    'city_expense_references',
    'users',
    'user_saved_properties',
    'user_viewed_properties',
    'waitlist'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    -- waitlist is not part of every local schema, so keep the migration safe
    -- for environments that only contain the catalog tables.
    IF to_regclass(format('%I.%I', 'public', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      'public',
      target_table
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon, authenticated',
      'public',
      target_table
    );

    -- A restrictive false policy documents the intentional deny-all boundary
    -- and prevents a later permissive policy from silently reopening access.
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      'deny_supabase_data_api',
      'public',
      target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      'deny_supabase_data_api',
      'public',
      target_table
    );
  END LOOP;
END
$migration$;

-- Identity sequences are not useful without table access and should not remain
-- callable through either browser-facing role.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Raw-SQL migrations created by postgres must start closed even if a future
-- author forgets to add RLS in the same migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
