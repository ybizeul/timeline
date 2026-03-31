import { useState, useEffect, useCallback } from 'react';

const TIMELINES_KEY    = 'timelines_index';
const ACTIVE_KEY       = 'timelines_active';
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

export function useTimelines() {
  const [timelines, setTimelines] = useState(() => loadTimelines());
  const [activeId, setActiveId] = useState(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_KEY);
      const list = loadTimelines();
      if (stored && list.some(t => t.id === stored)) return stored;
    } catch { /* ignore */ }
    return loadTimelines()[0].id;
  });

  // Persist activeId on change
  useEffect(() => {
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* ignore */ }
  }, [activeId]);

  // If the active timeline was deleted, fall back to the first one
  useEffect(() => {
    if (timelines.length > 0 && !timelines.find(t => t.id === activeId)) {
      setActiveId(timelines[0].id);
    }
  }, [timelines, activeId]);

  const switchTimeline = useCallback((id) => {
    setActiveId(id);
  }, []);

  const addTimeline = useCallback((name) => {
    const newTl = { id: crypto.randomUUID(), name };
    setTimelines(prev => {
      const next = [...prev, newTl];
      saveTimelines(next);
      return next;
    });
    setActiveId(newTl.id);
  }, []);

  const renameTimeline = useCallback((id, name) => {
    if (!name.trim()) return;
    setTimelines(prev => {
      const next = prev.map(t => t.id === id ? { ...t, name: name.trim() } : t);
      saveTimelines(next);
      return next;
    });
  }, []);

  const deleteTimeline = useCallback((id) => {
    // Remove this timeline's data from storage
    localStorage.removeItem(`timeline_events_${id}`);
    localStorage.removeItem(`timeline-viewport-${id}`);
    localStorage.removeItem(`timeline-savedpos-${id}`);
    setTimelines(prev => {
      const filtered = prev.filter(t => t.id !== id);
      const final = filtered.length > 0
        ? filtered
        : [{ id: crypto.randomUUID(), name: 'My Timeline' }];
      saveTimelines(final);
      return final;
    });
    // activeId correction is handled by the effect above
  }, []);

  const importTimeline = useCallback(async (file) => {
    const { parseTimelineFile } = await import('../utils/io.js');
    const { name, events, viewport, savedPosition } = await parseTimelineFile(file);
    const newId = crypto.randomUUID();
    // Store events
    localStorage.setItem(`timeline_events_${newId}`, JSON.stringify(events));
    // Store viewport if present
    if (viewport) {
      localStorage.setItem(`timeline-viewport-${newId}`, JSON.stringify(viewport));
    }
    // Store saved position if present
    if (savedPosition) {
      localStorage.setItem(`timeline-savedpos-${newId}`, JSON.stringify(savedPosition));
    }
    // Add to index
    setTimelines(prev => {
      const next = [...prev, { id: newId, name }];
      saveTimelines(next);
      return next;
    });
    setActiveId(newId);
  }, []);

  return { timelines, activeId, switchTimeline, addTimeline, renameTimeline, deleteTimeline, importTimeline };
}
