import { apiUrl } from './runtime';

async function request(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message = body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body;
}

export function apiGet(path) {
  return request(path, { method: 'GET' });
}

export function apiPost(path, data) {
  return request(path, { method: 'POST', body: JSON.stringify(data ?? {}) });
}

export function apiPut(path, data) {
  return request(path, { method: 'PUT', body: JSON.stringify(data ?? {}) });
}

export function apiPatch(path, data) {
  return request(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) });
}

export function apiDelete(path) {
  return request(path, { method: 'DELETE' });
}
