import { useState, useEffect, useCallback } from 'react';

function storageKey(timelineId) {
  return `timeline_events_${timelineId}`;
}

function loadEvents(timelineId) {
  try {
    const raw = localStorage.getItem(storageKey(timelineId));
    if (raw) return JSON.parse(raw);
    // Migrate legacy 'timeline_events' data for the default timeline
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
  } catch { /* storage quota exceeded */ }
}

export function useEvents(timelineId) {
  const [events, setEvents] = useState(() => loadEvents(timelineId));

  // Reload events whenever the active timeline changes
  useEffect(() => {
    setEvents(loadEvents(timelineId));
  }, [timelineId]);

  const addEvent = useCallback((event) => {
    const newEvent = { ...event, id: crypto.randomUUID() };
    setEvents(prev => {
      const next = [...prev, newEvent];
      saveEvents(timelineId, next);
      return next;
    });
    return newEvent;
  }, [timelineId]);

  const updateEvent = useCallback((id, updates) => {
    setEvents(prev => {
      const next = prev.map(ev => ev.id === id ? { ...ev, ...updates } : ev);
      saveEvents(timelineId, next);
      return next;
    });
  }, [timelineId]);

  const deleteEvent = useCallback((id) => {
    setEvents(prev => {
      const next = prev.filter(ev => ev.id !== id);
      saveEvents(timelineId, next);
      return next;
    });
  }, [timelineId]);

  return { events, addEvent, updateEvent, deleteEvent };
}
