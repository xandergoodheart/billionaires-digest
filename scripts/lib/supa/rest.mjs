// Tiny PostgREST client for the sync job (service role). Plain fetch, no SDK.
export function makeRest({ url, key, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '') + '/rest/v1';
  const headers = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys go in apikey only.
  if (/^eyJ/.test(key)) headers.Authorization = `Bearer ${key}`;

  async function req(method, path, body) {
    const r = await fetchImpl(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const msg = data && typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : String(text).slice(0, 300);
      const e = new Error(`${method} ${path}: HTTP ${r.status}: ${msg}`);
      e.status = r.status;
      throw e;
    }
    return data;
  }
  return {
    rpc: (name, args = {}) => req('POST', `/rpc/${name}`, args),
    select: (table, query = '') => req('GET', `/${table}${query ? '?' + query : ''}`)
  };
}
