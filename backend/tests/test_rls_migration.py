from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "db"
    / "migrations"
    / "20260925_harden_public_rls.sql"
)

EXPECTED_TABLES = {
    "properties",
    "property_events",
    "enrichments",
    "regional_market_prices",
    "regional_market_comparables",
    "market_reference_jobs",
    "city_expense_references",
    "users",
    "user_saved_properties",
    "user_viewed_properties",
    "user_sessions",
    "waitlist",
}


def test_rls_migration_covers_every_public_argos_table():
    sql = MIGRATION.read_text()

    for table in EXPECTED_TABLES:
        assert f"'{table}'" in sql

    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "AS RESTRICTIVE FOR ALL TO anon, authenticated" in sql
    assert "USING (false) WITH CHECK (false)" in sql


def test_rls_remediation_creates_server_sessions_before_hardening_them():
    sql = MIGRATION.read_text()

    create_session = sql.index("CREATE TABLE IF NOT EXISTS user_sessions")
    hardening_loop = sql.index("DO $migration$")
    assert create_session < hardening_loop
    assert "REFERENCES users(id) ON DELETE CASCADE" in sql
    assert "idx_user_sessions_expiry" in sql


def test_rls_migration_removes_current_and_default_data_api_privileges():
    sql = MIGRATION.read_text()

    assert "REVOKE ALL PRIVILEGES ON TABLE" in sql
    assert "REVOKE ALL PRIVILEGES ON ALL SEQUENCES" in sql
    assert "ALTER DEFAULT PRIVILEGES FOR ROLE postgres" in sql
    assert "REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated" in sql
    assert "REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated" in sql
