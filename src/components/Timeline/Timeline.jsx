import { useRef, useState, useEffect, useCallback } from 'react';
import { TimeAxis, LABEL_STRIP_H } from './TimeAxis';
import { TodayLine } from './TodayLine';
import { EventLayer } from './EventLayer';
import './Timeline.css';

const ZOOM_SENSITIVITY = 0.001;
const DRAG_ZOOM_SENSITIVITY = 0.006;
const DRAG_THRESHOLD = 4;

export function Timeline({ viewport, events, setSvgWidth, onWheel, onPan, onEventClick, showToday, showWeekends, height }) {
  const { viewStart, viewEnd } = viewport;
  const wrapperRef = useRef(null);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null); // { lastX, lastY, startX, startY, hasMoved, axis: null|'pan'|'zoom' }
  const wasRecentlyDraggingRef = useRef(false);

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

  // Pointer drag handlers — threshold-based so clicks on events still fire
  // Axis-locked: horizontal → pan, vertical → zoom
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    wrapperRef.current?.setPointerCapture(e.pointerId);
    const rect = wrapperRef.current.getBoundingClientRect();
    dragRef.current = {
      lastX: e.clientX, lastY: e.clientY,
      startX: e.clientX, startY: e.clientY,
      cursorX: e.clientX - rect.left,
      hasMoved: false, axis: null,
    };
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return;
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
    }

    if (d.hasMoved) {
      if (d.axis === 'pan') {
        onPan(-dx);
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
    dragRef.current = null;
    setIsDragging(false);
    // Small delay so event onClick sees wasRecentlyDragging before clearing
    setTimeout(() => { wasRecentlyDraggingRef.current = false; }, 80);
  }, []);

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
