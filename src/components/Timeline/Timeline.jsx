import { useRef, useState, useEffect, useCallback } from 'react';
import { TimeAxis, LABEL_STRIP_H } from './TimeAxis';
import { TodayLine } from './TodayLine';
import { EventLayer } from './EventLayer';
import './Timeline.css';

const ZOOM_SENSITIVITY = 0.001;

export function Timeline({ viewport, events, setSvgWidth, onWheel, onPan, onEventClick, showToday, height }) {
  const { viewStart, viewEnd } = viewport;
  const wrapperRef = useRef(null);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null); // { lastX, startX, hasMoved }
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
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragRef.current = { lastX: e.clientX, startX: e.clientX, hasMoved: false };
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.lastX;
    const totalMoved = Math.abs(e.clientX - dragRef.current.startX);
    if (totalMoved > 4) {
      if (!dragRef.current.hasMoved) {
        dragRef.current.hasMoved = true;
        wasRecentlyDraggingRef.current = true;
        setIsDragging(true);
      }
    }
    if (dragRef.current.hasMoved) {
      onPan(-dx);
    }
    dragRef.current.lastX = e.clientX;
  }, [onPan]);

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
