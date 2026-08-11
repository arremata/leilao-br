/**
 * API helpers for the Arremate frontend.
 * Calls go through the Vite dev proxy (/api → localhost:8000).
 */

/**
 * Fetch all previously analyzed properties.
 * @returns {Promise<Object[]>} — array of AuctionPropertyResult objects
 */
export async function fetchProperties() {
  const res = await fetch('/api/properties');
  if (!res.ok) return [];
  return res.json();
}

/**
 * Fetch dashboard data (KPIs, activity, city signals).
 * @returns {Promise<Object|null>}
 */
export async function fetchDashboard() {
  const res = await fetch('/api/dashboard');
  if (!res.ok) return null;
  return res.json();
}

/**
 * Fetch the ingested catalog (real listings from the DB).
 * @param {string} [uf] — optional state filter, e.g. 'PR'
 * @returns {Promise<Object[]>} — array of thin catalog cards
 */
export async function fetchCatalog(uf) {
  const res = await fetch(`/api/catalog${uf ? `?uf=${encodeURIComponent(uf)}` : ''}`);
  if (!res.ok) return [];
  return res.json();
}

/**
 * Fetch a single catalog item, including its `enrichment` (null if not analyzed).
 * @param {number|string} id — catalog property id
 * @returns {Promise<Object|null>}
 */
export async function fetchCatalogItem(id) {
  const res = await fetch(`/api/catalog/${id}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Run the on-demand enrichment pipeline for a catalog item.
 * @param {number|string} id — catalog property id
 * @returns {Promise<Object>} — AuctionPropertyResult JSON
 */
export async function analyzeCatalogItem(id) {
  const res = await fetch(`/api/catalog/${id}/analyze`, { method: 'POST' });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Analysis failed (${res.status})`);
  }
  return res.json();
}
