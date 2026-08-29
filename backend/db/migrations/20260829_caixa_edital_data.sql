ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS edital_data JSONB;
