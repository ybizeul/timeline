import { useState, useCallback, useRef, useEffect } from 'react';
import { xToT } from '../utils/timeScale';

const NOW = Date.now();
const DEFAULT_DURATION = 365 * 24 * 3600 * 1000; // 12 months
const MIN_DURATION = 3 * 60 * 60 * 1000;          // 3 hours
const MAX_DURATION = 50 * 365 * 24 * 3600 * 1000; // 50 years
const ZOOM_FACTOR = 0.15;
const SCROLL_PAN_FRACTION = 0.2;
const STORAGE_PREFIX = 'timeline-viewport-';
const DEFAULT_VIEWPORT = { viewStart: NOW - DEFAULT_DURATION / 2, viewEnd: NOW + DEFAULT_DURATION / 2 };

function loadViewport(activeId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + activeId);
    if (raw) {
      const { viewStart, viewEnd } = JSON.parse(raw);
      if (Number.isFinite(viewStart) && Number.isFinite(viewEnd) && viewEnd > viewStart) {
        return { viewStart, viewEnd };
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_VIEWPORT;
}

export function useViewport(activeId) {
  const [viewport, setViewport] = useState(() => loadViewport(activeId));

  // Reload viewport when switching timelines
  useEffect(() => {
    setViewport(loadViewport(activeId));
  }, [activeId]);

  // Persist viewport on change
  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + activeId, JSON.stringify(viewport));
  }, [activeId, viewport]);

  const svgWidthRef = useRef(800);

  const setSvgWidth = useCallback((w) => {
    svgWidthRef.current = w;
  }, []);

  const clamp = useCallback((start, end) => {
    let duration = end - start;
    if (duration < MIN_DURATION) {
      const center = (start + end) / 2;
      duration = MIN_DURATION;
      start = center - duration / 2;
      end = center + duration / 2;
    }
    if (duration > MAX_DURATION) {
      const center = (start + end) / 2;
      duration = MAX_DURATION;
      start = center - duration / 2;
      end = center + duration / 2;
    }
    return { viewStart: start, viewEnd: end };
  }, []);

  // Zoom centered on a given cursor X position (pixels)
  const zoomAt = useCallback((cursorX, factor) => {
    setViewport(prev => {
      const { viewStart, viewEnd } = prev;
      const w = svgWidthRef.current;
      const timeAtCursor = xToT(cursorX, viewStart, viewEnd, w);
      const duration = viewEnd - viewStart;
      const newDuration = Math.min(Math.max(duration * factor, MIN_DURATION), MAX_DURATION);
      const ratio = cursorX / w;
      const newStart = timeAtCursor - ratio * newDuration;
      const newEnd = newStart + newDuration;
      return clamp(newStart, newEnd);
    });
  }, [clamp]);

  // Pan by a delta in pixels
  const panBy = useCallback((deltaPx) => {
    setViewport(prev => {
      const { viewStart, viewEnd } = prev;
      const w = svgWidthRef.current;
      const msPerPx = (viewEnd - viewStart) / w;
      const deltaMs = deltaPx * msPerPx;
      return { viewStart: viewStart + deltaMs, viewEnd: viewEnd + deltaMs };
    });
  }, []);

  const zoomIn = useCallback(() => {
    zoomAt(svgWidthRef.current / 2, 1 - ZOOM_FACTOR * 2);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    zoomAt(svgWidthRef.current / 2, 1 + ZOOM_FACTOR * 2);
  }, [zoomAt]);

  const scrollLeft = useCallback(() => {
    panBy(-svgWidthRef.current * SCROLL_PAN_FRACTION);
  }, [panBy]);

  const scrollRight = useCallback(() => {
    panBy(svgWidthRef.current * SCROLL_PAN_FRACTION);
  }, [panBy]);

  const goToday = useCallback(() => {
    setViewport(prev => {
      const duration = prev.viewEnd - prev.viewStart;
      return clamp(NOW - duration / 2, NOW + duration / 2);
    });
  }, [clamp]);

  return {
    viewport,
    setSvgWidth,
    zoomAt,
    panBy,
    zoomIn,
    zoomOut,
    scrollLeft,
    scrollRight,
    goToday,
  };
}
