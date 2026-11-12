let token = localStorage.getItem('token') || '';
let onUnauthorized = () => {};
export const getToken = () => token;
export const setToken = t => { token = t; t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); };
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

const headers = json => ({ ...(json && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) });

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, { method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
  if (res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized();
  const err = new Error(data.error || 'Request failed (' + res.status + ')');
  err.status = res.status;
  throw err;
}

export async function api(path, opts) {
  const res = await request(path, opts);
  return res.status === 204 ? null : res.json();
}

export async function download(path, filename) {
  const blob = await (await request(path)).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
