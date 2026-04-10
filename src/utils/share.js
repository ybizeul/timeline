export function getShareContext() {
  try {
    const path = window.location.pathname || '';
    const match = path.match(/^\/s\/([^/]+)\/?$/);
    const raw = match?.[1] ? decodeURIComponent(match[1]) : (new URLSearchParams(window.location.search).get('share') || '');

    if (!raw) return { raw: '', mode: null, itemId: '', isShared: false };
    if (raw.startsWith('t_')) return { raw, mode: 'timeline', itemId: raw.slice(2), isShared: true };
    if (raw.startsWith('o_')) return { raw, mode: 'orgchart', itemId: raw.slice(2), isShared: true };
    return { raw, mode: null, itemId: '', isShared: true };
  } catch {
    return { raw: '', mode: null, itemId: '', isShared: false };
  }
}
