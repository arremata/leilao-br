# Caixa Ingestion — Backend Business Rules

How the backend turns Caixa Econômica Federal's public property list into
catalog rows, change history, and on-demand AI analysis.

Caixa sells repossessed/foreclosed real estate. It publishes one CSV per state
(UF). This backend fetches that CSV, normalizes each listing into a canonical
shape, upserts it into the catalog while recording what changed, and — only when
a user asks — scrapes the property's detail page and runs the AI pipeline.

---

## Pipeline overview

```
fetch CSV ─▶ parse ─▶ normalize ─▶ upsert + emit events ─▶ (lazy) detail scrape ─▶ (lazy) AI enrichment
 caixa_csv    caixa_csv   normalize      run.ingest            caixa_detail            enrichment.run
```

Everything up to and including upsert runs on every ingest. Detail scraping and
AI enrichment are **lazy**: they run per-property, on demand, triggered by the
analyze endpoint — never in bulk during ingest.

---

## 1. Source: the per-state CSV

- **URL:** `https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_<UF>.csv`
  (e.g. `..._PR.csv`).
- **Format:** Latin-1 encoded, `;`-delimited, with preamble lines before the
  real header row.
- **Bot gate:** both the portal and the file sit behind Radware Bot Manager, so
  a plain HTTP GET is blocked. Fetching goes through a **stealth Playwright**
  browser (`_download`): it visits the download page first to pick up cookies,
  then requests the CSV via the browser's own request API.
- **Manual fallback:** any caller can inject `csv_bytes` (or the CLI `--file`
  flag) to ingest a manually downloaded CSV and skip fetching entirely. This is
  the escape hatch if the bot gate ever blocks automated fetches.

### Parsing rules (`parse_caixa_csv`)

1. Decode as Latin-1 (never fails — bad bytes are replaced).
2. Scan lines for the **header row** — the first row that contains `uf` *and*
   one of the "imóvel number" / `cidade` columns. Everything above it (preamble)
   is ignored.
3. Header cells are matched to canonical keys via `CAIXA_HEADER_MAP`, using
   **NFKD Unicode normalization** on both sides so accented headers like
   `Preço`, `Endereço`, `N° do imóvel` match regardless of encoding quirks
   (`°` vs `º`, precomposed vs decomposed accents).
4. Each data row becomes a `RawListing` keyed by canonical keys.
5. **Rows without an imóvel number (`source_id`) are skipped** — the ID is the
   stable dedup key, so a row without one is unusable.

Header → canonical key mapping:

| CSV column               | canonical key   |
|--------------------------|-----------------|
| N° do imóvel             | `source_id`     |
| UF                       | `uf`            |
| Cidade                   | `city`          |
| Bairro                   | `neighborhood`  |
| Endereço                 | `address`       |
| Preço                    | `preco`         |
| Valor de avaliação       | `avaliacao`     |
| Desconto                 | `desconto_csv`  |
| Descrição                | `descricao`     |
| Modalidade de venda      | `modalidade`    |
| Link de acesso           | `detail_url`    |

---

## 2. Normalization (`normalize.py` + adapter `normalize`)

Turns raw strings into the canonical `NormalizedProperty`. Pure functions, no
I/O.

- **Money (`parse_brl_number`)** — parses Brazilian formatting: `.` is a
  thousands separator, `,` is the decimal (`"150.000,00"` → `150000.0`,
  `"R$ 68.816,17"` → `68816.17`). Empty/garbage → `0.0`.
- **Appraisal (`avaliacao`)** — kept only when `> 0`; otherwise `None`.
- **Official discount (`desconto_oficial` via `compute_discount`)** —
  `(1 − preco / avaliacao) × 100`, rounded to 2 decimals. Returns `None` when
  the appraisal is missing/zero, and **clamps negatives to 0** (a price above
  appraisal is reported as 0% discount, not a negative one).
  > This is the *official* Caixa discount (price vs. Caixa's own appraisal). It
  > is deliberately separate from the *market* discount, which the AI pipeline
  > computes later against real comparable sales.
- **Description mining (`parse_description`)** — best-effort extraction from the
  free-text `Descrição`, accent-insensitive:
  - `property_type` — first match among a known-types list (Apartamento, Casa,
    Terreno, Loja, Sala, Galpão, Gleba, Prédio, Sobrado, Imóvel, Comercial,
    Chácara).
  - `area_m2` — prefers *área privativa*, falls back to *área total*, then any
    `m²` figure.
  - `beds` — first `N quarto`/`N dormit…` count.
  - Anything not found stays `None`.
- **Modalidade (`map_modalidade`)** — collapses free text to a stable label:
  `Leilão SFI` (matches "leilão"/"sfi"), `Licitação Aberta` ("licita"),
  `Venda Direta Online` ("venda direta"/"online"), else `Outros`.
- **UF/city/etc.** — trimmed; UF upper-cased and defaulted to the adapter's UF.

---

## 3. Upsert + change history (`run.ingest`)

The heart of the business logic. One run = fetch all rows for a source+UF, then
reconcile them against the catalog inside a single transaction.

Dedup key: **`(source, source_id)`** (enforced by a DB unique constraint). This
is why re-ingesting the same listing updates the existing row instead of
duplicating it.

For each normalized listing:

- **New listing** (no existing row) → insert `Property` (`status="active"`,
  `first_seen_at = last_seen_at = now`), optionally geocode, then emit a
  **`new`** event carrying the price.
- **Existing listing** → detect changes, then update the row and bump
  `last_seen_at`, re-activating it if it had been marked removed:
  - **`price_change`** — emitted when the price moved by **at least half a
    cent** (`_preco_changed`). A plain float `!=` would fire on representation
    noise and pollute the history; the tolerance keeps events trustworthy.
    (Prices are stored as `Float`; integer-cents would be the cleaner long-term
    fix.)
  - **`praca_change`** — emitted when `modalidade` changed (e.g. moving from 1st
    to 2nd praça / to direct sale).
  - If any event fired → counts as **updated**; otherwise **unchanged**.
- **Removed detection** — after processing the batch, any row that is currently
  `active` for this **source + UF** but was **not seen this run** is flipped to
  `status="removed"` and gets a **`removed`** event.
  - **Safety guard:** this only runs when the current fetch returned at least one
    row (`if seen_ids:`). A failed/empty fetch will *not* mass-remove the whole
    catalog.

Everything commits once at the end. Geocoding happens **only for new rows** and
**only when a geocoder is supplied** (`--geocode`).

Change-event types: `new`, `price_change`, `praca_change`, `removed`. These are
append-only and form the audit trail (and the basis for future alerts).

---

## 4. Geocoding (`geocode.py`)

- Uses **Nominatim** (OpenStreetMap). Free, no key, but rate-limited.
- **Throttled** to ≥ 1 request/second (`min_interval_s`), with an injectable
  httpx client for testing.
- On success sets `lat`, `lng`, `geocode_status="ok"`; on failure
  `geocode_status="failed"`. Runs lazily-ish: new rows only, opt-in via
  `--geocode`.

---

## 5. Official detail and edital enrichment (`caixa_detail.py`)

The CSV has **no photo** and omits the structured facts published on each
property page and its edital. Scheduled ingestion fetches paced detail pages for
Caixa auctions, open tenders, and online direct sales. Direct sales do not
require a nonexistent property-specific edital or auctioneer; their property
facts, matrícula, and generic Caixa sale-rules PDF are collected instead. The
detail pipeline:

- `parse_detail_html` extracts:
  - `photo_url` — first `/fotos/…` image, absolutized against the base URL.
  - `document_urls` — all `.pdf` links (edital, matrícula).
  - `full_description` — tag-stripped page text.
  - property-specific edital facts such as item, IPTU registration, registry
    office, occupancy, accepted payment methods, and expense rules.
- Each shared edital PDF is downloaded once per run. Its text is parsed without
  an LLM, and Annex II rows are matched by Caixa property number to recover the
  official auction number, auctioneer contacts, commission, deadlines, values,
  and documented regularization alerts.
- The merged payload is persisted in `properties.edital_data`; extraction is
  best-effort and incomplete rows remain eligible for retry.

---

## 6. Lazy AI enrichment (`enrichment/run.py`)

Reuses the existing analysis graph, but **skips discovery + planner** (those
exist only to extract structure from raw HTML/PDF — the catalog is already
structured).

- `metadata_from_property` maps a `Property` row → the graph's
  `PropertyMetadata`.
- `run_structured_enrichment` runs the `market → legal → scoring → output`
  nodes and returns the structured result.
- The result is cached in the **`Enrichment`** table (one row per property,
  overwritten on re-analyze), tagged with `pipeline_version`.
- **Market vs. official discount:** the AI's `market` value comes from real
  comparable sales, *not* Caixa's appraisal — kept deliberately distinct from
  `desconto_oficial` above.

---

## 7. API surface (`api.py`)

| Method & path                    | Does                                                        |
|----------------------------------|-------------------------------------------------------------|
| `POST /ingest`                   | Runs an ingest (`{source, uf, file?}`), returns the summary |
| `GET /catalog?uf=`               | Lists **active** properties (optional UF filter)            |
| `GET /catalog/{id}`              | One property + its cached enrichment (if any)               |
| `POST /catalog/{id}/analyze`     | Lazy detail scrape → AI enrichment → cache + return         |

---

## 8. Storage model (recap)

Three tables (SQLAlchemy 2.0; SQLite locally, Postgres in prod; schema via
`create_all`, no Alembic in v1):

- **`properties`** — canonical current state, one row per listing, deduped by
  `(source, source_id)`.
- **`property_events`** — append-only change history (`new`/`price_change`/
  `praca_change`/`removed`).
- **`enrichments`** — cached AI result, 1:1 with a property.

---

## 9. Operating it

```bash
# Offline: ingest a manually downloaded CSV (safest — no bot gate)
python -m ingestion.run --uf PR --file /path/to/Lista_imoveis_PR.csv

# Live: fetch through Playwright (needs `playwright install chromium` first)
python -m ingestion.run --uf PR --geocode
```

Defaults: `--source caixa`, `--uf PR`. Local runs create `backend/leilao.db`;
production reads `DATABASE_URL`.

---

## Design invariants (don't break these)

- `(source, source_id)` is the identity of a listing. Never dedup on address or
  price.
- Removed-detection is scoped to **source + UF** and guarded against empty
  fetches — never let a bad fetch wipe the catalog.
- `desconto_oficial` (price vs. Caixa appraisal) and the AI `market` discount
  (price vs. real comparables) are **different numbers**; keep them separate.
- Detail scraping and AI enrichment are **lazy and per-property** — never bulk
  them into ingest.
- Price-change detection uses a half-cent tolerance, not exact float equality.
```
