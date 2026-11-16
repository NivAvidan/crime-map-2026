async function get(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`${res.status} ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const getMeta = () => get('/api/meta');
export const getLocalities = () => get('/api/localities');
export const getLocality = (code) => get(`/api/localities/${encodeURIComponent(code)}`);
export const getCrime = (code, quarter) =>
  get(`/api/localities/${encodeURIComponent(code)}/crime${quarter ? `?quarter=${quarter}` : ''}`);

export const fmt = (n) => (n ?? 0).toLocaleString('en-US');
export const norm = (s) =>
  (s || '').replace(/[\s\-־–'"׳״().*]/g, '').replace(/יי/g, 'י').replace(/וו/g, 'ו');
