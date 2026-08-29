CREATE TABLE IF NOT EXISTS city_expense_references (
    id SERIAL PRIMARY KEY,
    uf VARCHAR(2) NOT NULL,
    city VARCHAR(128) NOT NULL,
    annual_iptu_rate DOUBLE PRECISION NOT NULL,
    condo_per_m2_monthly DOUBLE PRECISION NOT NULL,
    reference_year INTEGER NOT NULL,
    source TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_city_expense_reference UNIQUE (uf, city)
);

CREATE INDEX IF NOT EXISTS ix_city_expense_references_uf
    ON city_expense_references (uf);
CREATE INDEX IF NOT EXISTS ix_city_expense_references_city
    ON city_expense_references (city);
