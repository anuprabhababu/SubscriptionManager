const BASE = import.meta.env.VITE_API_URL || '';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function api(path, options = {}) {
  const token = localStorage.getItem('subscriptly_token');
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(`${BASE}/api${path}`, { ...options, method, headers });
    } catch {
      throw new Error('Cannot reach the server. Check that the API is running.');
    }

    // Retrying a read is safe and helps when a hosted PostgreSQL database is waking up.
    if (method === 'GET' && response.status === 503 && attempt === 0) {
      const seconds = Number(response.headers.get('Retry-After'));
      await wait(Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0.5), 3) * 1000 : 1000);
      continue;
    }
    break;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) throw new Error('The server returned an invalid response. Please retry.');
    }
  }
  if (!response.ok) {
    if (response.status >= 500 && !data.error) throw new Error(`Server error (${response.status}). Please retry in a moment.`);
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}
