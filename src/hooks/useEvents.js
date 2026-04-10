import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../utils/api';
import { isServerMode } from '../utils/runtime';
import { getShareContext } from '../utils/share';

function storageKey(timelineId) {
  return `timeline_events_${timelineId}`;
}

function loadEvents(timelineId) {
  try {
    const raw = localStorage.getItem(storageKey(timelineId));
    if (raw) return JSON.parse(raw);
    if (timelineId === 'default') {
      const legacyRaw = localStorage.getItem('timeline_events');
      if (legacyRaw) {
        localStorage.setItem(storageKey(timelineId), legacyRaw);
        return JSON.parse(legacyRaw);
      }
    }
    return [];
  } catch {
    return [];
  }
}

function saveEvents(timelineId, events) {
  try {
    localStorage.setItem(storageKey(timelineId), JSON.stringify(events));
  } catch { /* ignore */ }
}

function useLocalEvents(timelineId) {
  const [events, setEvents] = useState(() => loadEvents(timelineId));

  useEffect(() => {
    setEvents(loadEvents(timelineId));
  }, [timelineId]);

  const addEvent = useCallback((event) => {
    const newEvent = { ...event, id: crypto.randomUUID() };
    setEvents((prev) => {
      const next = [...prev, newEvent];
      saveEvents(timelineId, next);
      return next;
    });
    return newEvent;
  }, [timelineId]);

  const updateEvent = useCallback((id, updates) => {
    setEvents((prev) => {
      const next = prev.map((ev) => (ev.id === id ? { ...ev, ...updates } : ev));
      saveEvents(timelineId, next);
      return next;
    });
  }, [timelineId]);

  const deleteEvent = useCallback((id) => {
    setEvents((prev) => {
      const next = prev.filter((ev) => ev.id !== id);
      saveEvents(timelineId, next);
      return next;
    });
  }, [timelineId]);

  return { events, addEvent, updateEvent, deleteEvent };
}

function useServerEvents(timelineId) {
  const share = getShareContext();
  const [events, setEvents] = useState([]);

  const persist = useCallback(async (next) => {
    if (share.mode === 'timeline' && share.itemId) return;
    if (!timelineId) return;
    await apiPut(`/api/private/timelines/${timelineId}/events`, { events: next });
  }, [timelineId, share.itemId, share.mode]);

  useEffect(() => {
    if (!timelineId) {
      setEvents([]);
      return;
    }
    const endpoint = share.mode === 'timeline' && share.itemId
      ? `/api/share/${share.raw}/events`
      : `/api/private/timelines/${timelineId}/events`;
    apiGet(endpoint)
      .then((data) => setEvents(Array.isArray(data?.events) ? data.events : []))
      .catch((err) => {
        console.error('Failed to load timeline events', err);
        setEvents([]);
      });
  }, [timelineId, share.itemId, share.mode, share.raw]);

  const addEvent = useCallback((event) => {
    const newEvent = { ...event, id: crypto.randomUUID() };
    setEvents((prev) => {
      const next = [...prev, newEvent];
      persist(next).catch((err) => console.error('Failed to persist event add', err));
      return next;
    });
    return newEvent;
  }, [persist]);

  const updateEvent = useCallback((id, updates) => {
    setEvents((prev) => {
      const next = prev.map((ev) => (ev.id === id ? { ...ev, ...updates } : ev));
      persist(next).catch((err) => console.error('Failed to persist event update', err));
      return next;
    });
  }, [persist]);

  const deleteEvent = useCallback((id) => {
    setEvents((prev) => {
      const next = prev.filter((ev) => ev.id !== id);
      persist(next).catch((err) => console.error('Failed to persist event delete', err));
      return next;
    });
  }, [persist]);

  return { events, addEvent, updateEvent, deleteEvent };
}

export function useEvents(timelineId, useServer = isServerMode) {
  const localState = useLocalEvents(timelineId);
  const serverState = useServerEvents(timelineId);
  return useServer ? serverState : localState;
}
