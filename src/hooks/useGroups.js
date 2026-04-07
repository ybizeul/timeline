import { useState, useEffect, useCallback } from 'react';

function storageKey(chartId) {
  return `orgchart_groups_${chartId}`;
}

function loadGroups(chartId) {
  try {
    const raw = localStorage.getItem(storageKey(chartId));
    if (raw) return JSON.parse(raw);
    return [];
  } catch {
    return [];
  }
}

function saveGroups(chartId, groups) {
  try {
    localStorage.setItem(storageKey(chartId), JSON.stringify(groups));
  } catch { /* storage quota exceeded */ }
}

export function useGroups(chartId) {
  const [groups, setGroups] = useState(() => loadGroups(chartId));

  useEffect(() => {
    setGroups(loadGroups(chartId));
  }, [chartId]);

  const addGroup = useCallback((personIds, label = 'Group') => {
    const newGroup = { id: crypto.randomUUID(), personIds, label };
    setGroups(prev => {
      const next = [...prev, newGroup];
      saveGroups(chartId, next);
      return next;
    });
    return newGroup;
  }, [chartId]);

  const updateGroup = useCallback((id, updates) => {
    setGroups(prev => {
      const next = prev.map(g => g.id === id ? { ...g, ...updates } : g);
      saveGroups(chartId, next);
      return next;
    });
  }, [chartId]);

  const deleteGroup = useCallback((id) => {
    setGroups(prev => {
      const next = prev.filter(g => g.id !== id);
      saveGroups(chartId, next);
      return next;
    });
  }, [chartId]);

  // Remove deleted people from groups
  const cleanupPerson = useCallback((personId) => {
    setGroups(prev => {
      const next = prev.map(g => {
        const filtered = g.personIds.filter(pid => pid !== personId);
        return filtered.length === g.personIds.length ? g : { ...g, personIds: filtered };
      }).filter(g => g.personIds.length >= 2);
      saveGroups(chartId, next);
      return next;
    });
  }, [chartId]);

  return { groups, addGroup, updateGroup, deleteGroup, cleanupPerson };
}
