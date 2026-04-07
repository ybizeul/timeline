import { useState, useEffect, useCallback } from 'react';

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

export function useOrgCharts() {
  const [charts, setCharts] = useState(() => loadCharts());
  const [activeId, setActiveId] = useState(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_KEY);
      const list = loadCharts();
      if (stored && list.some(c => c.id === stored)) return stored;
    } catch { /* ignore */ }
    return loadCharts()[0].id;
  });

  useEffect(() => {
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* ignore */ }
  }, [activeId]);

  useEffect(() => {
    if (charts.length > 0 && !charts.find(c => c.id === activeId)) {
      setActiveId(charts[0].id);
    }
  }, [charts, activeId]);

  const switchChart = useCallback((id) => {
    setActiveId(id);
  }, []);

  const addChart = useCallback((name) => {
    const newChart = { id: crypto.randomUUID(), name };
    setCharts(prev => {
      const next = [...prev, newChart];
      saveCharts(next);
      return next;
    });
    setActiveId(newChart.id);
  }, []);

  const renameChart = useCallback((id, name) => {
    if (!name.trim()) return;
    setCharts(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name: name.trim() } : c);
      saveCharts(next);
      return next;
    });
  }, []);

  const deleteChart = useCallback((id) => {
    localStorage.removeItem(`orgchart_people_${id}`);
    localStorage.removeItem(`orgchart-viewport-${id}`);
    setCharts(prev => {
      const filtered = prev.filter(c => c.id !== id);
      const final = filtered.length > 0
        ? filtered
        : [{ id: crypto.randomUUID(), name: 'My Org Chart' }];
      saveCharts(final);
      return final;
    });
  }, []);

  const importChart = useCallback(async (file) => {
    const { parseOrgChartFile } = await import('../utils/orgChartIo');
    const { name, people, viewport } = await parseOrgChartFile(file);
    const id = crypto.randomUUID();
    const newChart = { id, name };
    setCharts(prev => {
      const next = [...prev, newChart];
      saveCharts(next);
      return next;
    });
    try {
      localStorage.setItem(`orgchart_people_${id}`, JSON.stringify(people));
      if (viewport) localStorage.setItem(`orgchart-viewport-${id}`, JSON.stringify(viewport));
    } catch { /* ignore */ }
    setActiveId(id);
  }, []);

  return { charts, activeId, switchChart, addChart, renameChart, deleteChart, importChart };
}
