import { useState, useCallback, useRef, useEffect } from 'react';
import { xToT } from '../utils/timeScale';
import { apiGet, apiPut } from '../utils/api';
import { isServerMode } from '../utils/runtime';
import { getShareContext } from '../utils/share';

const NOW = Date.now();
const DEFAULT_DURATION = 365 * 24 * 3600 * 1000; // 12 months
const MIN_DURATION = 3 * 60 * 60 * 1000;          // 3 hours
const MAX_DURATION = 50 * 365 * 24 * 3600 * 1000; // 50 years
const ZOOM_FACTOR = 0.15;
const SCROLL_PAN_FRACTION = 0.2;
const STORAGE_PREFIX = 'timeline-viewport-';
const SAVED_POS_PREFIX = 'timeline-savedpos-';
const DEFAULT_VIEWPORT = { viewStart: NOW - DEFAULT_DURATION / 2, viewEnd: NOW + DEFAULT_DURATION / 2, tlHeight: null };
const MIN_TIMELINE_HEIGHT = 100;

function normalizeTimelineHeight(value) {
  const tlHeight = Number(value);
  return Number.isFinite(tlHeight) && tlHeight >= MIN_TIMELINE_HEIGHT ? tlHeight : null;
}

function normalizeViewport(viewport) {
  return {
    ...viewport,
    tlHeight: normalizeTimelineHeight(viewport?.tlHeight),
  };
}

function loadViewport(activeId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + activeId);
    if (raw) {
      const { viewStart, viewEnd, tlHeight } = JSON.parse(raw);
      if (Number.isFinite(viewStart) && Number.isFinite(viewEnd) && viewEnd > viewStart) {
        return normalizeViewport({ viewStart, viewEnd, tlHeight });
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_VIEWPORT;
}

function loadSavedPosition(activeId) {
  try {
    const raw = localStorage.getItem(SAVED_POS_PREFIX + activeId);
    if (raw) {
      const { viewStart, viewEnd } = JSON.parse(raw);
      if (Number.isFinite(viewStart) && Number.isFinite(viewEnd) && viewEnd > viewStart) {
        return { viewStart, viewEnd };
      }
    }
  } catch { /* ignore */ }
  return null;
}

function parseServerState(data) {
  const viewport = data?.viewport && typeof data.viewport === 'object' ? data.viewport : {};
  const savedPosition = data?.savedPosition && typeof data.savedPosition === 'object' ? data.savedPosition : null;

  const viewStart = Number(viewport.viewStart);
  const viewEnd = Number(viewport.viewEnd);
  const tlHeight = Number(viewport.tlHeight);

  const normalizedViewport = Number.isFinite(viewStart) && Number.isFinite(viewEnd) && viewEnd > viewStart
    ? normalizeViewport({ viewStart, viewEnd, tlHeight })
    : DEFAULT_VIEWPORT;

  let normalizedSaved = null;
  if (savedPosition) {
    const spStart = Number(savedPosition.viewStart);
    const spEnd = Number(savedPosition.viewEnd);
    if (Number.isFinite(spStart) && Number.isFinite(spEnd) && spEnd > spStart) {
      normalizedSaved = { viewStart: spStart, viewEnd: spEnd };
    }
  }

  return { viewport: normalizedViewport, savedPosition: normalizedSaved };
}

export function useViewport(activeId, useServer = isServerMode) {
  const share = getShareContext();
  const [viewport, setViewport] = useState(() => loadViewport(activeId));
  const [hasSavedPosition, setHasSavedPosition] = useState(() => useServer ? false : !!loadSavedPosition(activeId));
  const switchingRef = useRef(false);
  const activeIdRef = useRef(activeId);
  const viewportRef = useRef(viewport);
  const savedPositionRef = useRef(isServerMode ? null : loadSavedPosition(activeId));
  const persistTimeoutRef = useRef(null);
  viewportRef.current = viewport;

  // Reload viewport when switching timelines
  useEffect(() => {
    if (activeIdRef.current !== activeId) {
      if (!useServer) {
        // Save final viewport for the timeline we're leaving
        localStorage.setItem(
          STORAGE_PREFIX + activeIdRef.current,
          JSON.stringify(viewportRef.current),
        );
      }
      activeIdRef.current = activeId;
    }
    switchingRef.current = true;
    if (!useServer) {
      const saved = loadSavedPosition(activeId);
      savedPositionRef.current = saved;
      setViewport(loadViewport(activeId));
      setHasSavedPosition(!!saved);
      return;
    }

    let cancelled = false;
    const endpoint = share.mode === 'timeline' && share.itemId
      ? `/api/share/${share.raw}/state`
      : `/api/private/timelines/${activeId}/state`;
    apiGet(endpoint)
      .then((state) => {
        if (cancelled) return;
        const parsed = parseServerState(state);
        savedPositionRef.current = parsed.savedPosition;
        setViewport(parsed.viewport);
        setHasSavedPosition(!!parsed.savedPosition);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load timeline state', err);
        savedPositionRef.current = null;
        setViewport(DEFAULT_VIEWPORT);
        setHasSavedPosition(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, share.itemId, share.mode, share.raw, useServer]);

  // Persist viewport on change — skip during timeline switch to avoid
  // writing the old timeline's position to the new timeline's key
  useEffect(() => {
    if (switchingRef.current) {
      switchingRef.current = false;
      return;
    }
    if (!useServer) {
      localStorage.setItem(STORAGE_PREFIX + activeId, JSON.stringify(normalizeViewport(viewport)));
      return;
    }

    if (share.mode === 'timeline' && share.itemId) {
      return;
    }

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      const normalized = normalizeViewport(viewport);
      apiPut(`/api/private/timelines/${activeId}/state`, {
        viewport: normalized,
        savedPosition: savedPositionRef.current || {},
      }).catch((err) => console.error('Failed to persist timeline state', err));
    }, 180);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [activeId, viewport, share.itemId, share.mode, useServer]);

  // Save viewport on page unload so the final position is never lost
  useEffect(() => {
    if (useServer) return;
    const save = () =>
      localStorage.setItem(
        STORAGE_PREFIX + activeIdRef.current,
        JSON.stringify(normalizeViewport(viewportRef.current)),
      );
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, [useServer]);

  const svgWidthRef = useRef(0);
  const initialResizeRef = useRef(true);

  // When the SVG container resizes, adjust viewEnd to keep the same msPerPx (zoom level).
  // Anchored on the left edge so the view doesn't jump.
  // On the very first call (initial mount), just record the width without adjusting —
  // the loaded viewport from localStorage is already correct.
  const setSvgWidth = useCallback((w) => {
    const prevW = svgWidthRef.current;
    svgWidthRef.current = w;
    if (initialResizeRef.current) {
      initialResizeRef.current = false;
      return;
    }
    if (prevW > 0 && w > 0 && w !== prevW) {
      setViewport(prev => {
        const msPerPx = (prev.viewEnd - prev.viewStart) / prevW;
        const newEnd = prev.viewStart + msPerPx * w;
        return { ...prev, viewEnd: newEnd };
      });
    }
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

  const savePosition = useCallback(() => {
    const { viewStart, viewEnd } = viewport;
    savedPositionRef.current = { viewStart, viewEnd };
    if (!useServer) {
      localStorage.setItem(SAVED_POS_PREFIX + activeId, JSON.stringify({ viewStart, viewEnd }));
    } else if (share.mode === 'timeline' && share.itemId) {
      // Shared links are read-only; keep the value only in memory.
    } else {
      const normalized = normalizeViewport(viewport);
      apiPut(`/api/private/timelines/${activeId}/state`, {
        viewport: normalized,
        savedPosition: savedPositionRef.current,
      }).catch((err) => console.error('Failed to save timeline position', err));
    }
    setHasSavedPosition(true);
  }, [activeId, viewport, share.itemId, share.mode, useServer]);

  const recallPosition = useCallback(() => {
    const saved = useServer ? savedPositionRef.current : loadSavedPosition(activeId);
    if (saved) setViewport(clamp(saved.viewStart, saved.viewEnd));
  }, [activeId, clamp, useServer]);

  const setTimelineHeight = useCallback((tlHeight) => {
    setViewport((prev) => ({ ...prev, tlHeight: normalizeTimelineHeight(tlHeight) }));
  }, []);

  return {
    viewport,
    setSvgWidth,
    svgWidthRef,
    zoomAt,
    panBy,
    zoomIn,
    zoomOut,
    scrollLeft,
    scrollRight,
    goToday,
    setTimelineHeight,
    savePosition,
    recallPosition,
    hasSavedPosition,
  };
}

export function useViewportStable(activeId, useServer = isServerMode) {
  const localState = useViewport(activeId, false);
  const serverState = useViewport(activeId, true);
  return useServer ? serverState : localState;
}
