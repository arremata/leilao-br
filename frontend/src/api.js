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
 * Analyze an auction URL and return an AuctionPropertyResult object.
 * @param {string} url — auction listing URL
 * @returns {Promise<Object>} — AuctionPropertyResult JSON
 */
/**
 * Fetch dashboard data (KPIs, activity, city signals).
 * @returns {Promise<Object|null>}
 */
export async function fetchDashboard() {
  const res = await fetch('/api/dashboard');
  if (!res.ok) return null;
  return res.json();
}

export async function analyzeUrl(url) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Analysis failed (${res.status})`);
  }

  return res.json();
}
