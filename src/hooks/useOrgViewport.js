import { useState, useCallback, useEffect, useRef } from 'react';

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

export function useOrgViewport(chartId) {
  const [viewport, setViewport] = useState(() => loadViewport(chartId));
  const switchingRef = useRef(false);
  const activeIdRef = useRef(chartId);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    if (activeIdRef.current !== chartId) {
      localStorage.setItem(STORAGE_PREFIX + activeIdRef.current, JSON.stringify(viewportRef.current));
      activeIdRef.current = chartId;
    }
    switchingRef.current = true;
    setViewport(loadViewport(chartId));
  }, [chartId]);

  useEffect(() => {
    if (switchingRef.current) {
      switchingRef.current = false;
      return;
    }
    localStorage.setItem(STORAGE_PREFIX + chartId, JSON.stringify(viewport));
  }, [chartId, viewport]);

  useEffect(() => {
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

  return { viewport, panBy, panTo, zoomAt, zoomIn, zoomOut, fitToScreen, resetView };
}
