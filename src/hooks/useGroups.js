import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPut } from '../utils/api';
import { isServerMode } from '../utils/runtime';
import { getShareContext } from '../utils/share';

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
  } catch { /* ignore */ }
}

function useLocalGroups(chartId) {
  const [groups, setGroups] = useState(() => loadGroups(chartId));

  useEffect(() => {
    setGroups(loadGroups(chartId));
  }, [chartId]);

  const addGroup = useCallback((personIds, label = 'Group') => {
    const newGroup = { id: crypto.randomUUID(), personIds, label };
    setGroups((prev) => {
      const next = [...prev, newGroup];
      saveGroups(chartId, next);
      return next;
    });
    return newGroup;
  }, [chartId]);

  const updateGroup = useCallback((id, updates) => {
    setGroups((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, ...updates } : g));
      saveGroups(chartId, next);
      return next;
    });
  }, [chartId]);

  const deleteGroup = useCallback((id) => {
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      saveGroups(chartId, next);
      return next;
    });
  }, [chartId]);

  const cleanupPerson = useCallback((personId) => {
    setGroups((prev) => {
      const next = prev.map((g) => {
        const filtered = g.personIds.filter((pid) => pid !== personId);
        return filtered.length === g.personIds.length ? g : { ...g, personIds: filtered };
      }).filter((g) => g.personIds.length >= 2);
      saveGroups(chartId, next);
      return next;
    });
  }, [chartId]);

  return { groups, addGroup, updateGroup, deleteGroup, cleanupPerson };
}

function useServerGroups(chartId) {
  const share = getShareContext();
  const [groups, setGroups] = useState([]);

  const persist = useCallback(async (next) => {
    if (share.mode === 'orgchart' && share.itemId) return;
    if (!chartId) return;
    await apiPut(`/api/private/orgcharts/${chartId}/groups`, { groups: next });
  }, [chartId, share.itemId, share.mode]);

  useEffect(() => {
    if (!chartId) {
      setGroups([]);
      return;
    }
    const endpoint = share.mode === 'orgchart' && share.itemId
      ? `/api/share/${share.raw}/groups`
      : `/api/private/orgcharts/${chartId}/groups`;
    apiGet(endpoint)
      .then((data) => setGroups(Array.isArray(data?.groups) ? data.groups : []))
      .catch((err) => {
        console.error('Failed to load org groups', err);
        setGroups([]);
      });
  }, [chartId, share.itemId, share.mode, share.raw]);

  const addGroup = useCallback((personIds, label = 'Group') => {
    const newGroup = { id: crypto.randomUUID(), personIds, label };
    setGroups((prev) => {
      const next = [...prev, newGroup];
      persist(next).catch((err) => console.error('Failed to persist group add', err));
      return next;
    });
    return newGroup;
  }, [persist]);

  const updateGroup = useCallback((id, updates) => {
    setGroups((prev) => {
      const next = prev.map((g) => (g.id === id ? { ...g, ...updates } : g));
      persist(next).catch((err) => console.error('Failed to persist group update', err));
      return next;
    });
  }, [persist]);

  const deleteGroup = useCallback((id) => {
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      persist(next).catch((err) => console.error('Failed to persist group delete', err));
      return next;
    });
  }, [persist]);

  const cleanupPerson = useCallback((personId) => {
    setGroups((prev) => {
      const next = prev.map((g) => {
        const filtered = g.personIds.filter((pid) => pid !== personId);
        return filtered.length === g.personIds.length ? g : { ...g, personIds: filtered };
      }).filter((g) => g.personIds.length >= 2);
      persist(next).catch((err) => console.error('Failed to persist group cleanup', err));
      return next;
    });
  }, [persist]);

  return { groups, addGroup, updateGroup, deleteGroup, cleanupPerson };
}

export function useGroups(chartId, useServer = isServerMode) {
  const localState = useLocalGroups(chartId);
  const serverState = useServerGroups(chartId);
  return useServer ? serverState : localState;
}
