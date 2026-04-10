export const isServerMode = import.meta.env.VITE_RUNTIME_MODE === 'server';
export const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export function apiUrl(path) {
  if (!path.startsWith('/')) return `${apiBase}/${path}`;
  return `${apiBase}${path}`;
}
