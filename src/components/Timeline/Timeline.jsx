import { useRef, useState, useEffect, useCallback } from 'react';
import { TimeAxis, LABEL_STRIP_H } from './TimeAxis';
import { TodayLine } from './TodayLine';
import { EventLayer } from './EventLayer';
import './Timeline.css';

const ZOOM_SENSITIVITY = 0.001;
const DRAG_ZOOM_SENSITIVITY = 0.006;
const DRAG_THRESHOLD = 4;
const INERTIA_FRICTION = 0.92;
const INERTIA_MIN_V = 0.5;

export function Timeline({ viewport, events, setSvgWidth, onWheel, onPan, onEventClick, showToday, showWeekends, height }) {
  const { viewStart, viewEnd } = viewport;
  const wrapperRef = useRef(null);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null); // { lastX, lastY, startX, startY, hasMoved, axis: null|'pan'|'zoom' }
  const wasRecentlyDraggingRef = useRef(false);
  const pinchRef = useRef(null);
  const inertiaRef = useRef(null);  // { vx, raf }

  // ResizeObserver
  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSvgSize({ width, height });
      setSvgWidth(width);
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [setSvgWidth]);

  // Wheel handler
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = wrapperRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    // deltaY > 0 = scroll down = zoom out; deltaY < 0 = zoom in
    const factor = 1 + e.deltaY * ZOOM_SENSITIVITY * 2;
    onWheel(cursorX, factor);
  }, [onWheel]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Touch pinch-to-zoom + two-finger pan
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const center = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        dragRef.current = null;
        setIsDragging(false);
        pinchRef.current = { dist: dist(e.touches[0], e.touches[1]), center: center(e.touches[0], e.touches[1]) };
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const c = center(e.touches[0], e.touches[1]);
        const rect = el.getBoundingClientRect();
        const anchorX = c.x - rect.left;
        onWheel(anchorX, pinchRef.current.dist / d);
        onPan(-(c.x - pinchRef.current.center.x));
        pinchRef.current = { dist: d, center: c };
      }
    };
    const onTouchEnd = () => { pinchRef.current = null; };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onWheel, onPan]);

  // Pointer drag handlers — threshold-based so clicks on events still fire
  // Axis-locked: horizontal → pan, vertical → zoom
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    // Cancel any running inertia animation
    if (inertiaRef.current) { cancelAnimationFrame(inertiaRef.current.raf); inertiaRef.current = null; }
    const rect = wrapperRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX, lastY: e.clientY,
      startX: e.clientX, startY: e.clientY,
      cursorX: e.clientX - rect.left,
      hasMoved: false, axis: null,
      lastTime: Date.now(), vx: 0,
    };
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current || pinchRef.current) return;
    const d = dragRef.current;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    const totalDx = Math.abs(e.clientX - d.startX);
    const totalDy = Math.abs(e.clientY - d.startY);
    const totalMoved = Math.max(totalDx, totalDy);

    if (totalMoved > DRAG_THRESHOLD && !d.hasMoved) {
      d.hasMoved = true;
      d.axis = totalDx >= totalDy ? 'pan' : 'zoom';
      wasRecentlyDraggingRef.current = true;
      setIsDragging(true);
      // Capture pointer only once drag is confirmed, so clicks on events still fire
      wrapperRef.current?.setPointerCapture(d.pointerId);
    }

    if (d.hasMoved) {
      if (d.axis === 'pan') {
        onPan(-dx);
        // Track velocity for inertia
        const now = Date.now();
        const dt = now - d.lastTime;
        if (dt > 0) { d.vx = -dx / dt; }
        d.lastTime = now;
      } else {
        // drag up (negative dy) = zoom in (factor < 1)
        const factor = 1 + dy * DRAG_ZOOM_SENSITIVITY;
        onWheel(d.cursorX, factor);
      }
    }
    d.lastX = e.clientX;
    d.lastY = e.clientY;
  }, [onPan, onWheel]);

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current;
    // Start inertia if we were panning with enough velocity
    if (d?.hasMoved && d.axis === 'pan' && Math.abs(d.vx) > INERTIA_MIN_V / 1000) {
      let vx = d.vx * 16; // convert from px/ms to px/frame (~16ms)
      const tick = () => {
        vx *= INERTIA_FRICTION;
        if (Math.abs(vx) < INERTIA_MIN_V) { inertiaRef.current = null; return; }
        onPan(vx);
        inertiaRef.current = { raf: requestAnimationFrame(tick) };
      };
      inertiaRef.current = { raf: requestAnimationFrame(tick) };
    }
    dragRef.current = null;
    setIsDragging(false);
    // Small delay so event onClick sees wasRecentlyDragging before clearing
    setTimeout(() => { wasRecentlyDraggingRef.current = false; }, 80);
  }, [onPan]);

  return (
    <div
      ref={wrapperRef}
      className={`timeline-wrapper${isDragging ? ' is-dragging' : ''}`}
      style={height != null ? { flex: 'none', height } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <svg
        className="timeline-svg"
        viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Subtle horizontal bands for readability */}
        <rect x={0} y={0} width={svgSize.width} height={svgSize.height} fill="var(--bg)" />

        <TimeAxis
          viewStart={viewStart}
          viewEnd={viewEnd}
          svgWidth={svgSize.width}
          axisY={svgSize.height - LABEL_STRIP_H}
          showWeekends={showWeekends}
        />
        {showToday && (
          <TodayLine
            viewStart={viewStart}
            viewEnd={viewEnd}
            svgWidth={svgSize.width}
            svgHeight={svgSize.height}
            axisY={svgSize.height - LABEL_STRIP_H}
          />
        )}
        <EventLayer
          events={events}
          viewStart={viewStart}
          viewEnd={viewEnd}
          svgWidth={svgSize.width}
          axisY={svgSize.height - LABEL_STRIP_H}
          onEventClick={onEventClick}
          wasDragging={wasRecentlyDraggingRef}
        />
      </svg>

      {events.length === 0 && (
        <div className="timeline-empty">
          <div className="timeline-empty__icon">🗓</div>
          <div className="timeline-empty__title">No events yet</div>
          <div className="timeline-empty__sub">Click "+ Add event" to create your first event</div>
        </div>
      )}
    </div>
  );
}
