import { useState, useEffect, useCallback } from 'react';
import { parseTimelineFile } from '../utils/io';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../utils/api';
import { isServerMode } from '../utils/runtime';
import { getShareContext } from '../utils/share';

const TIMELINES_KEY = 'timelines_index';
const ACTIVE_KEY = 'timelines_active';
const DEFAULT_TIMELINE = { id: 'default', name: 'My Timeline' };

function loadTimelines() {
  try {
    const raw = localStorage.getItem(TIMELINES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [DEFAULT_TIMELINE];
}

function saveTimelines(list) {
  try { localStorage.setItem(TIMELINES_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function useLocalTimelines() {
  const [timelines, setTimelines] = useState(() => loadTimelines());
  const [activeId, setActiveId] = useState(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_KEY);
      const list = loadTimelines();
      if (stored && list.some((t) => t.id === stored)) return stored;
    } catch { /* ignore */ }
    return loadTimelines()[0].id;
  });

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* ignore */ }
  }, [activeId]);

  useEffect(() => {
    if (timelines.length > 0 && !timelines.find((t) => t.id === activeId)) {
      setActiveId(timelines[0].id);
    }
  }, [timelines, activeId]);

  const switchTimeline = useCallback((id) => {
    setActiveId(id);
  }, []);

  const addTimeline = useCallback((name) => {
    const newTl = { id: crypto.randomUUID(), name };
    setTimelines((prev) => {
      const next = [...prev, newTl];
      saveTimelines(next);
      return next;
    });
    setActiveId(newTl.id);
  }, []);

  const renameTimeline = useCallback((id, name) => {
    if (!name.trim()) return;
    setTimelines((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t));
      saveTimelines(next);
      return next;
    });
  }, []);

  const deleteTimeline = useCallback((id) => {
    localStorage.removeItem(`timeline_events_${id}`);
    localStorage.removeItem(`timeline-viewport-${id}`);
    localStorage.removeItem(`timeline-savedpos-${id}`);
    setTimelines((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      const final = filtered.length > 0 ? filtered : [{ id: crypto.randomUUID(), name: 'My Timeline' }];
      saveTimelines(final);
      return final;
    });
  }, []);

  const importTimeline = useCallback(async (file) => {
    const { name, events, viewport, savedPosition } = await parseTimelineFile(file);
    const newId = crypto.randomUUID();
    localStorage.setItem(`timeline_events_${newId}`, JSON.stringify(events));
    if (viewport) localStorage.setItem(`timeline-viewport-${newId}`, JSON.stringify(viewport));
    if (savedPosition) localStorage.setItem(`timeline-savedpos-${newId}`, JSON.stringify(savedPosition));
    setTimelines((prev) => {
      const next = [...prev, { id: newId, name }];
      saveTimelines(next);
      return next;
    });
    setActiveId(newId);
  }, []);

  return { timelines, activeId, switchTimeline, addTimeline, renameTimeline, deleteTimeline, importTimeline };
}

function useServerTimelines() {
  const share = getShareContext();
  const [timelines, setTimelines] = useState([]);
  const [activeId, setActiveId] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch { return ''; }
  });

  const refresh = useCallback(async () => {
    if (share.mode === 'timeline' && share.itemId) {
      const data = await apiGet(`/api/share/${share.raw}`);
      const name = typeof data?.name === 'string' && data.name ? data.name : 'Shared Timeline';
      const shared = { id: share.itemId, name };
      setTimelines([shared]);
      setActiveId(share.itemId);
      return;
    }

    const data = await apiGet('/api/private/timelines');
    const list = Array.isArray(data?.timelines) ? data.timelines : [];
    if (list.length === 0) {
      const created = await apiPost('/api/private/timelines', { name: 'My Timeline' });
      setTimelines([created]);
      setActiveId(created.id);
      try { localStorage.setItem(ACTIVE_KEY, created.id); } catch { /* ignore */ }
      return;
    }
    setTimelines(list);
    if (!activeId || !list.some((t) => t.id === activeId)) {
      const fallback = list[0].id;
      setActiveId(fallback);
      try { localStorage.setItem(ACTIVE_KEY, fallback); } catch { /* ignore */ }
    }
  }, [activeId, share.itemId, share.mode, share.raw]);

  useEffect(() => {
    refresh().catch((err) => {
      console.error('Failed to load timelines', err);
      setTimelines([]);
    });
  }, [refresh]);

  useEffect(() => {
    if (!activeId) return;
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* ignore */ }
  }, [activeId]);

  const switchTimeline = useCallback((id) => {
    setActiveId(id);
  }, []);

  const addTimeline = useCallback(async (name) => {
    const created = await apiPost('/api/private/timelines', { name: name?.trim() || 'New Timeline' });
    setTimelines((prev) => [...prev, created]);
    setActiveId(created.id);
  }, []);

  const renameTimeline = useCallback(async (id, name) => {
    if (!name?.trim()) return;
    await apiPatch(`/api/private/timelines/${id}`, { name: name.trim() });
    setTimelines((prev) => prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)));
  }, []);

  const deleteTimeline = useCallback(async (id) => {
    await apiDelete(`/api/private/timelines/${id}`);
    setTimelines((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length > 0 && !next.some((t) => t.id === activeId)) {
        setActiveId(next[0].id);
      }
      return next;
    });
    await refresh();
  }, [activeId, refresh]);

  const importTimeline = useCallback(async (file) => {
    const { name, events, viewport, savedPosition } = await parseTimelineFile(file);
    const created = await apiPost('/api/private/timelines', { name });
    await apiPut(`/api/private/timelines/${created.id}/events`, { events });
    await apiPut(`/api/private/timelines/${created.id}/state`, { viewport: viewport || {}, savedPosition: savedPosition || {} });
    setTimelines((prev) => [...prev, created]);
    setActiveId(created.id);
  }, []);

  return { timelines, activeId, switchTimeline, addTimeline, renameTimeline, deleteTimeline, importTimeline };
}

export function useTimelines(useServer = isServerMode) {
  const localState = useLocalTimelines();
  const serverState = useServerTimelines();
  return useServer ? serverState : localState;
}
