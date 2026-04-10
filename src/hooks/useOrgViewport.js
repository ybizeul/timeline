import { useState, useCallback, useEffect, useRef } from 'react';
import { apiGet, apiPut } from '../utils/api';
import { isServerMode } from '../utils/runtime';
import { getShareContext } from '../utils/share';

const STORAGE_PREFIX = 'orgchart-viewport-';
const ZOOM_FACTOR = 0.15;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const DEFAULT_VIEWPORT = { panX: 0, panY: 0, zoom: 1 };

function loadViewport(chartId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + chartId);
    if (raw) {
      const { panX, panY, zoom } = JSON.parse(raw);
      if (Number.isFinite(panX) && Number.isFinite(panY) && Number.isFinite(zoom)) {
        return { panX, panY, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) };
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_VIEWPORT;
}

function parseServerOrgState(data) {
  const viewport = data?.viewport && typeof data.viewport === 'object' ? data.viewport : {};
  const panX = Number(viewport.panX);
  const panY = Number(viewport.panY);
  const zoom = Number(viewport.zoom);
  const normalizedViewport = Number.isFinite(panX) && Number.isFinite(panY) && Number.isFinite(zoom)
    ? { panX, panY, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }
    : DEFAULT_VIEWPORT;

  const collapsedIds = Array.isArray(data?.collapsedIds)
    ? data.collapsedIds.filter((v) => typeof v === 'string')
    : [];
  const showCardControls = typeof data?.showCardControls === 'boolean' ? data.showCardControls : true;

  return { viewport: normalizedViewport, collapsedIds, showCardControls };
}

export function useOrgViewport(chartId) {
  const share = getShareContext();
  const [viewport, setViewport] = useState(() => loadViewport(chartId));
  const switchingRef = useRef(false);
  const activeIdRef = useRef(chartId);
  const viewportRef = useRef(viewport);
  const persistTimeoutRef = useRef(null);
  const stateMetaRef = useRef({ collapsedIds: [], showCardControls: true });
  viewportRef.current = viewport;

  useEffect(() => {
    if (activeIdRef.current !== chartId) {
      if (!isServerMode) {
        localStorage.setItem(STORAGE_PREFIX + activeIdRef.current, JSON.stringify(viewportRef.current));
      }
      activeIdRef.current = chartId;
    }
    switchingRef.current = true;
    if (!isServerMode) {
      setViewport(loadViewport(chartId));
      return;
    }

    let cancelled = false;
    const endpoint = share.mode === 'orgchart' && share.itemId
      ? `/api/share/${share.raw}/state`
      : `/api/private/orgcharts/${chartId}/state`;
    apiGet(endpoint)
      .then((state) => {
        if (cancelled) return;
        const parsed = parseServerOrgState(state);
        stateMetaRef.current = {
          collapsedIds: parsed.collapsedIds,
          showCardControls: parsed.showCardControls,
        };
        setViewport(parsed.viewport);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load org chart state', err);
        stateMetaRef.current = { collapsedIds: [], showCardControls: true };
        setViewport(DEFAULT_VIEWPORT);
      });

    return () => {
      cancelled = true;
    };
  }, [chartId, share.itemId, share.mode, share.raw]);

  useEffect(() => {
    if (switchingRef.current) {
      switchingRef.current = false;
      return;
    }
    if (!isServerMode) {
      localStorage.setItem(STORAGE_PREFIX + chartId, JSON.stringify(viewport));
      return;
    }

    if (share.mode === 'orgchart' && share.itemId) {
      return;
    }

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      apiPut(`/api/private/orgcharts/${chartId}/state`, {
        viewport,
        collapsedIds: stateMetaRef.current.collapsedIds,
        showCardControls: stateMetaRef.current.showCardControls,
      }).catch((err) => console.error('Failed to persist org chart viewport', err));
    }, 180);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [chartId, viewport, share.itemId, share.mode]);

  useEffect(() => {
    if (isServerMode) return;
    const save = () =>
      localStorage.setItem(STORAGE_PREFIX + activeIdRef.current, JSON.stringify(viewportRef.current));
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, []);

  const panBy = useCallback((dx, dy) => {
    setViewport(prev => ({ ...prev, panX: prev.panX + dx, panY: prev.panY + dy }));
  }, []);

  const zoomAt = useCallback((cursorX, cursorY, factor) => {
    setViewport(prev => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor));
      const ratio = newZoom / prev.zoom;
      // Zoom towards cursor: adjust pan so the point under cursor stays fixed
      const newPanX = cursorX - ratio * (cursorX - prev.panX);
      const newPanY = cursorY - ratio * (cursorY - prev.panY);
      return { panX: newPanX, panY: newPanY, zoom: newZoom };
    });
  }, []);

  const zoomIn = useCallback(() => {
    setViewport(prev => {
      const newZoom = Math.min(MAX_ZOOM, prev.zoom * (1 + ZOOM_FACTOR * 2));
      return { ...prev, zoom: newZoom };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => {
      const newZoom = Math.max(MIN_ZOOM, prev.zoom * (1 - ZOOM_FACTOR * 2));
      return { ...prev, zoom: newZoom };
    });
  }, []);

  const fitToScreen = useCallback((bounds, containerW, containerH) => {
    if (!bounds || containerW <= 0 || containerH <= 0) return;
    const { minX, minY, maxX, maxY } = bounds;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return;
    const padding = 60;
    const scaleX = (containerW - padding * 2) / contentW;
    const scaleY = (containerH - padding * 2) / contentH;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(scaleX, scaleY)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = containerW / 2 - centerX * newZoom;
    const newPanY = containerH / 2 - centerY * newZoom;
    setViewport({ panX: newPanX, panY: newPanY, zoom: newZoom });
  }, []);

  const resetView = useCallback(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, []);

  const panTo = useCallback((panX, panY) => {
    setViewport(prev => ({ ...prev, panX, panY }));
  }, []);

  const animRef = useRef(null);

  const animatePanTo = useCallback((panX, panY) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = viewportRef.current;
    const startX = start.panX;
    const startY = start.panY;
    const t0 = performance.now();
    const duration = 1000;
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now) => {
      const t = Math.min((now - t0) / duration, 1);
      const e = ease(t);
      setViewport(prev => ({
        ...prev,
        panX: startX + (panX - startX) * e,
        panY: startY + (panY - startY) * e,
      }));
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else animRef.current = null;
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  return { viewport, panBy, panTo, animatePanTo, zoomAt, zoomIn, zoomOut, fitToScreen, resetView };
}
