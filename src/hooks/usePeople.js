import { useState, useEffect, useCallback } from 'react';

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
  } catch { /* storage quota exceeded */ }
}

export function usePeople(chartId) {
  const [people, setPeople] = useState(() => loadPeople(chartId));

  useEffect(() => {
    setPeople(loadPeople(chartId));
  }, [chartId]);

  const addPerson = useCallback((person) => {
    const newPerson = { ...person, id: crypto.randomUUID() };
    setPeople(prev => {
      const next = [...prev, newPerson];
      savePeople(chartId, next);
      return next;
    });
    return newPerson;
  }, [chartId]);

  const updatePerson = useCallback((id, updates) => {
    setPeople(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      savePeople(chartId, next);
      return next;
    });
  }, [chartId]);

  const deletePerson = useCallback((id) => {
    setPeople(prev => {
      // Clear references to the deleted person
      const next = prev
        .filter(p => p.id !== id)
        .map(p => ({
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
