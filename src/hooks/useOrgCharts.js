import { useState, useEffect, useCallback } from 'react';
import { parseOrgChartFile } from '../utils/orgChartIo';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../utils/api';
import { isServerMode } from '../utils/runtime';
import { getShareContext } from '../utils/share';

const INDEX_KEY = 'orgcharts_index';
const ACTIVE_KEY = 'orgcharts_active';
const DEFAULT_CHART = { id: 'default-org', name: 'My Org Chart' };

function loadCharts() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [DEFAULT_CHART];
}

function saveCharts(list) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function useLocalOrgCharts() {
  const [charts, setCharts] = useState(() => loadCharts());
  const [activeId, setActiveId] = useState(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_KEY);
      const list = loadCharts();
      if (stored && list.some((c) => c.id === stored)) return stored;
    } catch { /* ignore */ }
    return loadCharts()[0].id;
  });

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* ignore */ }
  }, [activeId]);

  useEffect(() => {
    if (charts.length > 0 && !charts.find((c) => c.id === activeId)) {
      setActiveId(charts[0].id);
    }
  }, [charts, activeId]);

  const switchChart = useCallback((id) => {
    setActiveId(id);
  }, []);

  const addChart = useCallback((name) => {
    const newChart = { id: crypto.randomUUID(), name };
    setCharts((prev) => {
      const next = [...prev, newChart];
      saveCharts(next);
      return next;
    });
    setActiveId(newChart.id);
  }, []);

  const renameChart = useCallback((id, name) => {
    if (!name.trim()) return;
    setCharts((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, name: name.trim() } : c));
      saveCharts(next);
      return next;
    });
  }, []);

  const deleteChart = useCallback((id) => {
    localStorage.removeItem(`orgchart_people_${id}`);
    localStorage.removeItem(`orgchart_groups_${id}`);
    localStorage.removeItem(`orgchart-viewport-${id}`);
    setCharts((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      const final = filtered.length > 0 ? filtered : [{ id: crypto.randomUUID(), name: 'My Org Chart' }];
      saveCharts(final);
      return final;
    });
  }, []);

  const importChart = useCallback(async (file) => {
    const { name, people, groups, viewport } = await parseOrgChartFile(file);
    const id = crypto.randomUUID();
    const newChart = { id, name };
    setCharts((prev) => {
      const next = [...prev, newChart];
      saveCharts(next);
      return next;
    });
    try {
      localStorage.setItem(`orgchart_people_${id}`, JSON.stringify(people));
      if (groups && groups.length > 0) localStorage.setItem(`orgchart_groups_${id}`, JSON.stringify(groups));
      if (viewport) localStorage.setItem(`orgchart-viewport-${id}`, JSON.stringify(viewport));
    } catch { /* ignore */ }
    setActiveId(id);
  }, []);

  return { charts, activeId, switchChart, addChart, renameChart, deleteChart, importChart };
}

function useServerOrgCharts() {
  const share = getShareContext();
  const [charts, setCharts] = useState([]);
  const [activeId, setActiveId] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch { return ''; }
  });

  const refresh = useCallback(async () => {
    if (share.mode === 'orgchart' && share.itemId) {
      const data = await apiGet(`/api/share/${share.raw}`);
      const name = typeof data?.name === 'string' && data.name ? data.name : 'Shared Org Chart';
      const shared = { id: share.itemId, name };
      setCharts([shared]);
      setActiveId(share.itemId);
      return;
    }

    const data = await apiGet('/api/private/orgcharts');
    const list = Array.isArray(data?.charts) ? data.charts : [];
    if (list.length === 0) {
      const created = await apiPost('/api/private/orgcharts', { name: 'My Org Chart' });
      setCharts([created]);
      setActiveId(created.id);
      try { localStorage.setItem(ACTIVE_KEY, created.id); } catch { /* ignore */ }
      return;
    }
    setCharts(list);
    if (!activeId || !list.some((c) => c.id === activeId)) {
      const fallback = list[0].id;
      setActiveId(fallback);
      try { localStorage.setItem(ACTIVE_KEY, fallback); } catch { /* ignore */ }
    }
  }, [activeId, share.itemId, share.mode, share.raw]);

  useEffect(() => {
    refresh().catch((err) => {
      console.error('Failed to load org charts', err);
      setCharts([]);
    });
  }, [refresh]);

  useEffect(() => {
    if (!activeId) return;
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* ignore */ }
  }, [activeId]);

  const switchChart = useCallback((id) => {
    setActiveId(id);
  }, []);

  const addChart = useCallback(async (name) => {
    const created = await apiPost('/api/private/orgcharts', { name: name?.trim() || 'New Org Chart' });
    setCharts((prev) => [...prev, created]);
    setActiveId(created.id);
  }, []);

  const renameChart = useCallback(async (id, name) => {
    if (!name?.trim()) return;
    await apiPatch(`/api/private/orgcharts/${id}`, { name: name.trim() });
    setCharts((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)));
  }, []);

  const deleteChart = useCallback(async (id) => {
    await apiDelete(`/api/private/orgcharts/${id}`);
    setCharts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length > 0 && !next.some((c) => c.id === activeId)) {
        setActiveId(next[0].id);
      }
      return next;
    });
    await refresh();
  }, [activeId, refresh]);

  const importChart = useCallback(async (file) => {
    const { name, people, groups, viewport } = await parseOrgChartFile(file);
    const created = await apiPost('/api/private/orgcharts', { name });
    await apiPut(`/api/private/orgcharts/${created.id}/people`, { people });
    await apiPut(`/api/private/orgcharts/${created.id}/groups`, { groups });
    await apiPut(`/api/private/orgcharts/${created.id}/state`, { viewport: viewport || {}, collapsedIds: [], showCardControls: true });
    setCharts((prev) => [...prev, created]);
    setActiveId(created.id);
  }, []);

  return { charts, activeId, switchChart, addChart, renameChart, deleteChart, importChart };
}

export function useOrgCharts() {
  return isServerMode ? useServerOrgCharts() : useLocalOrgCharts();
}
