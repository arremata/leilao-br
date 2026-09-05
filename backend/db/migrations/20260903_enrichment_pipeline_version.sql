-- Pipeline labels are descriptive identifiers and can exceed the original
-- v1-era 16-character allocation.
ALTER TABLE enrichments
    ALTER COLUMN pipeline_version TYPE VARCHAR(64);
