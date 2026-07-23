# Ingestor Photo Fetching — Design

> Status: design. Implementation plan to follow.
> Date: 2026-07-22.

## Problem

The Caixa CSV feed has no photo. The picture only exists on the per-property
detail page at `venda-imoveis.caixa.gov.br`, behind the same Radware Bot Manager
that guards the CSV. Today the ingestor (`ingestion/run.py:ingest`) only
consumes the CSV, so ingested rows land in the catalog with `photo_url = NULL`.

Photos are currently fetched **lazily by the API**: when a user clicks "Analyze"
on a catalog item, `_maybe_fetch_detail` (`api.py:286`) calls
`fetch_detail(detail_url)` and stores `photo_url`. Two problems:

1. The catalog shows no photos until a manual analyze happens on each listing.
2. The lazy path uses `tools/web_scraper.scrape_page`, which is **headless**
   Playwright — and headless always hits the Radware CAPTCHA wall on real Caixa
   pages (per `project_caixa_fetch` memory, verified 2026-07-14). So even manual
   analyze probably fails to get a photo today.

## Goal

During the scheduled worker run, for each **new or not-yet-fetched** Caixa
listing, fetch its detail page in the **same headed-Chrome session that
downloads the CSV**, extract the photo URL, and persist it to
`properties.photo_url`. The `/catalog` endpoint then returns photos with no
manual analyze needed.

## Decisions (locked during brainstorming)

- **Scope:** both — ingestor fetches photos during the scheduled run, using the
  headed-Chrome path that passes Radware.
- **Which listings:** new or not-yet-fetched only. Fetch on first ingest (no
  existing row) and when `detail_fetched = False`. Skip listings already
  fetched. No periodic refresh. (Note: a price change alone does NOT trigger a
  re-fetch — photos rarely change.)
- **Browser session:** one headed-Chrome session per worker run, shared across
  the CSV download and all detail-page fetches.
- **Failure isolation:** per-listing. A failed detail fetch logs a warning,
  leaves `photo_url = NULL` and `detail_fetched = False`, and the run
  continues. Next run retries.
- **Tests:** pure-logic only. Network paths (`_download`,
  `_fetch_detail_html`) are TDD-exempt, matching the existing convention.

## Architecture

### Approach

**Approach A — adapter owns the session.** `CaixaCsvAdapter` already owns
`_download` (which opens/closes Chrome for the CSV). Lift the browser lifecycle
into the adapter as instance state: `fetch_raw()` opens a persistent context on
first call, keeps it alive, and the adapter exposes two new methods —
`fetch_detail_html(detail_url)` and `close()`. `ingest()` calls them and closes
in a `finally`.

Chosen over:
- **B (worker owns the session)** — cleaner separation but requires moving the
  CSV-download wizard out of the adapter, a larger refactor than this feature
  needs.
- **C (adapter as context manager)** — same capability as A, Pythonic lifecycle,
  slightly more machinery. Stylistic difference only.

### Data flow (one UF)

```
worker.run_worker(uf)
  -> adapter = CaixaCsvAdapter(uf)
  -> ingest(session_factory, adapter)
       raws = adapter.fetch_raw()            # opens Chrome, downloads CSV, keeps session
       for raw in raws:
           normalize -> upsert Property
           if _needs_detail_fetch(existing, n):
               html = adapter.fetch_detail_html(n.detail_url)   # same Chrome, same tab
               if html:
                   parsed = parse_detail_html(html, base_url=...)
                   prop.photo_url = parsed["photo_url"]   # if any
                   prop.detail_fetched = True
               # else: leave detail_fetched=False; next run retries
       finally: adapter.close()              # closes Chrome (idempotent)
```

## Component changes

### `backend/ingestion/adapters/caixa_csv.py`

The adapter holds the browser session as instance state, opened lazily by
`_download` and closed explicitly by `close()`.

New instance attributes:
- `self._pw = None` — Playwright instance.
- `self._context = None` — persistent browser context.
- `self._page = None` — the tab used for both CSV download and detail fetches.

Behavior changes:
- **`_download()`** opens `self._pw` / `self._context` / `self._page` via
  `launch_persistent_context` (same args as today: `channel="chrome"`,
  `headless=self.headless`, `PROFILE_DIR`, `accept_downloads=True`). Downloads
  the CSV. **Does not close the context.** Returns the CSV bytes.
- **`fetch_detail_html(detail_url) -> str`** (new, sync). Sync wrapper around
  `_fetch_detail_html`. Returns HTML or `""` (never raises). Returns `""` when
  `detail_url` is empty or when the session was never opened (e.g. tests with
  `csv_bytes` injected).
- **`_fetch_detail_html(detail_url) -> str`** (new, async). Navigates
  `self._page` to `detail_url`, waits briefly for images, returns
  `await self._page.content()`. Catches any exception, logs a warning, returns
  `""`.
- **`close()`** (new, sync). Idempotent. Closes `self._context` and stops
  `self._pw` if open. Safe to call when the session was never opened. Safe to
  call twice.

`fetch_raw()` and `normalize()` are unchanged. `parse_caixa_csv` and the module
helpers are unchanged.

### `backend/ingestion/run.py`

New helper:
```python
def _needs_detail_fetch(existing: Property | None, n: NormalizedProperty) -> bool:
    """True when we should try to fetch the detail page for this listing.

    Fetch on first ingest (no existing row) and when a row was seen before but
    never had its detail page fetched (detail_fetched=False). Do NOT re-fetch
    on every run -- photos rarely change.
    """
    if existing is None:
        return True
    return not existing.detail_fetched
```

`ingest()` changes:
- Wrap the body in `try: ... finally:` and call `adapter.close()` (guarded with
  `getattr`) in `finally`.
- In the `for raw in raws:` loop, after the insert/update if/else, bind the
  property to a single name (`prop`) in both branches (small cleanup so the
  detail-fetch step has one variable to write to).
- After the upsert, if `_needs_detail_fetch(existing, n)`:
  - `fetcher = getattr(adapter, "fetch_detail_html", None)`
  - If `fetcher is not None and n.detail_url`:
    - `html = fetcher(n.detail_url)`
    - If `html`: `parsed = parse_detail_html(html, base_url="https://venda-imoveis.caixa.gov.br")`; if `parsed.get("photo_url")`: `prop.photo_url = parsed["photo_url"]`; set `prop.detail_fetched = True`.
    - Else: leave `photo_url = None`, `detail_fetched = False` (retry next run).

`_apply_fields` is unchanged — `NormalizedProperty.photo_url` is always `None`
from the CSV; the photo is written directly to `prop.photo_url` by the new step.

No change to event emission. Photo updates do not create `PropertyEvent`s.

### `backend/ingestion/adapters/caixa_detail.py`

**Unchanged.** `parse_detail_html` is already pure and tested. The async
`fetch_detail` (which uses headless `scrape_page`) stays for the lazy API path
but is no longer called by the ingestor.

### `backend/db/models.py`

**Unchanged.** `Property.photo_url` and `Property.detail_fetched` already exist.

### `backend/ingestion/worker.py`

**Unchanged.** Already loops UFs and calls `ingest()` per UF with per-UF
try/except. The new `adapter.close()` happens inside `ingest()`'s `finally`, so
the worker doesn't need to know about it.

### `backend/api.py`

**Unchanged.** The lazy `_maybe_fetch_detail` path stays as-is — it's now a
fallback for listings ingested before the worker ran. Fixing it to use headed
Chrome is out of scope (the API is serverless on Vercel and can't run headed
Chrome).

### `SourceAdapter` protocol (`adapters/base.py`)

**Unchanged at the type level.** `fetch_detail_html` and `close` are *optional*
methods. `ingest()` calls them via `getattr(adapter, ..., None)`, so adapters
that don't implement them (future sources, test stubs) work without changes.

## Testing strategy

Pure-logic only. Network paths (`_download`, `_fetch_detail_html`) are
TDD-exempt — same convention as today's `_download`.

### `backend/tests/test_caixa_csv.py` (adapter lifecycle)

1. **`close()` is idempotent and safe when session never opened** — construct
   adapter with `csv_bytes=...`, never call `fetch_raw`, call `close()` twice.
   No exception.
2. **`fetch_detail_html` returns `""` when session never opened** — adapter
   with `csv_bytes=`, call `fetch_detail_html("https://...")`. Returns `""`, no
   exception.
3. **`fetch_detail_html` returns `""` for empty `detail_url`** — guard clause.

### Decision-logic tests (`_needs_detail_fetch`)

4. Returns `True` for new listings (`existing=None`).
5. Returns `True` when `existing.detail_fetched = False`.
6. Returns `False` when `existing.detail_fetched = True`.

### `ingest()` photo-path tests (stub adapter, in-memory sqlite)

7. **`ingest()` calls `fetch_detail_html` for new listings and writes
   `photo_url`** — stub adapter returns one raw listing; stub
   `fetch_detail_html` returns HTML containing a `/fotos/` image; assert
   `prop.photo_url` is set and `prop.detail_fetched is True`.
8. **`ingest()` skips photo fetch when `detail_fetched=True`** — pre-existing
   row with `detail_fetched=True`; stub `fetch_detail_html` should NOT be
   called. Assert call count zero.
9. **`ingest()` leaves `detail_fetched=False` when `fetch_detail_html` returns
   empty** — stub returns `""`; assert `prop.photo_url is None` and
   `prop.detail_fetched is False`.
10. **`ingest()` calls `adapter.close()` in `finally` on success** — stub with
    a `close` spy; assert called.
11. **`ingest()` calls `adapter.close()` in `finally` on exception** — stub
    `fetch_raw` raises; assert `close` was still called.
12. **`ingest()` works with an adapter that has no `fetch_detail_html`/`close`**
    — a minimal stub (just `fetch_raw`/`normalize`, like the existing
    `test_ingestion_worker.py` stub). No `AttributeError`.

### Unchanged

- `test_caixa_detail.py` — `parse_detail_html` is unchanged.
- `test_ingestion_worker.py` — the worker itself is unchanged; existing stub
  adapter continues to work because `fetch_detail_html`/`close` are optional.

## Out of scope

1. **Fixing the lazy API path (`_maybe_fetch_detail`).** Still uses headless
   `scrape_page`. Once the ingestor populates `photo_url` proactively, the lazy
   path is a fallback, not the primary source. Fixing it means giving the API a
   headed-Chrome path, which is a separate concern (Vercel serverless can't).
2. **Re-fetching photos on a schedule.** Photos rarely change; re-fetching N
   listings per UF per day is wasteful.
3. **A `photo_added` `PropertyEvent`.** Photo updates don't emit events. Small
   addition later if wanted.
4. **Concurrent detail fetches.** One tab, sequential. Parallelizing multiplies
   Radware risk.
5. **Caching detail HTML across runs.** Unnecessary — `detail_fetched=True`
  already skips the fetch.

## Files touched

- `backend/ingestion/adapters/caixa_csv.py` — session lifecycle, new methods.
- `backend/ingestion/run.py` — `_needs_detail_fetch`, detail-fetch step in
  `ingest()`, `close()` in `finally`.
- `backend/tests/test_caixa_csv.py` — adapter lifecycle tests.
- `backend/tests/test_ingest_run.py` (new) — `_needs_detail_fetch` +
  `ingest()` photo-path tests with a stub adapter and in-memory sqlite.

## Files NOT touched

- `backend/ingestion/adapters/caixa_detail.py` (unchanged).
- `backend/api.py` (unchanged).
- `backend/ingestion/worker.py` (unchanged).
- `backend/db/models.py` (already has `photo_url`/`detail_fetched`).
- `Dockerfile.ingest` / `run-ingest.sh` (unchanged — already wrap the worker).
- `backend/ingestion/adapters/base.py` (protocol unchanged; new methods are
  optional, called via `getattr`).
