import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { layoutEvents } from '../../utils/eventLayout';
import { EventItem, EventTooltip } from './EventItem';
import { tToX } from '../../utils/timeScale';

export function EventLayer({ events, viewStart, viewEnd, svgWidth, axisY, onEventClick, wasDragging }) {
  // Recalculate layout once web fonts (Inter) finish loading so text
  // measurements match the actual SVG rendering width.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)); }, []);
  
  // Tooltip state
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef(null);

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleEventMouseEnter = (ev, clientX, clientY) => {
    // Store absolute client coordinates for tooltip
    setTooltipPos({ x: clientX, y: clientY });
    // Show tooltip after 500ms
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEvent(ev);
    }, 500);
  };

  const handleEventMouseLeave = () => {
    // Cancel pending tooltip
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Delay hiding to allow mouse to move to tooltip
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEvent(null);
    }, 150);
  };

  const handleTooltipMouseEnter = () => {
    // Cancel pending hide
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    setHoveredEvent(null);
  };

  const laid = useMemo(
    () => {
      const items = layoutEvents(events, viewStart, viewEnd, svgWidth);
      // Render higher events first so lower events (and their connectors)
      // paint on top — connectors from higher events pass under lower ones.
      return [...items].sort((a, b) => b.yOffset - a.yOffset);
    },
    [events, viewStart, viewEnd, svgWidth, fontsReady]
  );

  // Extract laid items with background tint enabled
  const tintedItems = useMemo(
    () => laid.filter(item => item.ev.tintBackground && item.ev.endDate),
    [laid]
  );

  return (
    <g className="event-layer">
      {/* Render background tints first (behind all events) */}
      {tintedItems.map(item => {
        const startX = tToX(item.start, viewStart, viewEnd, svgWidth);
        const endX = tToX(item.end, viewStart, viewEnd, svgWidth);
        const width = Math.max(endX - startX, 0);
        
        return (
          <rect
            key={`tint-${item.ev.id}`}
            x={startX}
            y={0}
            width={width}
            height={axisY}
            fill={item.ev.color}
            opacity={0.08}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
      
      {/* Render events on top */}
      {laid.map(item => (
        <EventItem
          key={item.ev.id}
          layoutItem={item}
          viewStart={viewStart}
          viewEnd={viewEnd}
          svgWidth={svgWidth}
          axisY={axisY}
          onClick={onEventClick}
          wasDragging={wasDragging}
          onMouseEnter={handleEventMouseEnter}
          onMouseLeave={handleEventMouseLeave}
        />
      ))}
      
      {/* Render tooltip as HTML overlay directly to body using portal */}
      {hoveredEvent && createPortal(
        <EventTooltip 
          ev={hoveredEvent} 
          clientX={tooltipPos.x} 
          clientY={tooltipPos.y}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        />,
        document.body
      )}
    </g>
  );
}
