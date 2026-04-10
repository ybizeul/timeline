import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../utils/api';
import { isServerMode } from '../utils/runtime';
import { getShareContext } from '../utils/share';

function storageKey(chartId) {
  return `orgchart_people_${chartId}`;
}

function loadPeople(chartId) {
  try {
    const raw = localStorage.getItem(storageKey(chartId));
    if (raw) return JSON.parse(raw);
    return [];
  } catch {
    return [];
  }
}

function savePeople(chartId, people) {
  try {
    localStorage.setItem(storageKey(chartId), JSON.stringify(people));
  } catch { /* ignore */ }
}

function useLocalPeople(chartId) {
  const [people, setPeople] = useState(() => loadPeople(chartId));

  useEffect(() => {
    setPeople(loadPeople(chartId));
  }, [chartId]);

  const addPerson = useCallback((person) => {
    const newPerson = { ...person, id: crypto.randomUUID() };
    setPeople((prev) => {
      const next = [...prev, newPerson];
      savePeople(chartId, next);
      return next;
    });
    return newPerson;
  }, [chartId]);

  const updatePerson = useCallback((id, updates) => {
    setPeople((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      savePeople(chartId, next);
      return next;
    });
  }, [chartId]);

  const deletePerson = useCallback((id) => {
    setPeople((prev) => {
      const next = prev
        .filter((p) => p.id !== id)
        .map((p) => ({
          ...p,
          reportsTo: p.reportsTo === id ? null : p.reportsTo,
          dottedReportsTo: p.dottedReportsTo === id ? null : p.dottedReportsTo,
        }));
      savePeople(chartId, next);
      return next;
    });
  }, [chartId]);

  return { people, addPerson, updatePerson, deletePerson };
}

function useServerPeople(chartId) {
  const share = getShareContext();
  const [people, setPeople] = useState([]);

  const persist = useCallback(async (next) => {
    if (share.mode === 'orgchart' && share.itemId) return;
    if (!chartId) return;
    await apiPut(`/api/private/orgcharts/${chartId}/people`, { people: next });
  }, [chartId, share.itemId, share.mode]);

  useEffect(() => {
    if (!chartId) {
      setPeople([]);
      return;
    }
    const endpoint = share.mode === 'orgchart' && share.itemId
      ? `/api/share/${share.raw}/people`
      : `/api/private/orgcharts/${chartId}/people`;
    apiGet(endpoint)
      .then((data) => setPeople(Array.isArray(data?.people) ? data.people : []))
      .catch((err) => {
        console.error('Failed to load org people', err);
        setPeople([]);
      });
  }, [chartId, share.itemId, share.mode, share.raw]);

  const addPerson = useCallback((person) => {
    const newPerson = { ...person, id: crypto.randomUUID() };
    setPeople((prev) => {
      const next = [...prev, newPerson];
      persist(next).catch((err) => console.error('Failed to persist person add', err));
      return next;
    });
    return newPerson;
  }, [persist]);

  const updatePerson = useCallback((id, updates) => {
    setPeople((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      persist(next).catch((err) => console.error('Failed to persist person update', err));
      return next;
    });
  }, [persist]);

  const deletePerson = useCallback((id) => {
    setPeople((prev) => {
      const next = prev
        .filter((p) => p.id !== id)
        .map((p) => ({
          ...p,
          reportsTo: p.reportsTo === id ? null : p.reportsTo,
          dottedReportsTo: p.dottedReportsTo === id ? null : p.dottedReportsTo,
        }));
      persist(next).catch((err) => console.error('Failed to persist person delete', err));
      return next;
    });
  }, [persist]);

  return { people, addPerson, updatePerson, deletePerson };
}

export function usePeople(chartId, useServer = isServerMode) {
  const localState = useLocalPeople(chartId);
  const serverState = useServerPeople(chartId);
  return useServer ? serverState : localState;
}
