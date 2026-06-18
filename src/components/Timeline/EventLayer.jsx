import { useMemo, useState, useEffect } from 'react';
import { layoutEvents } from '../../utils/eventLayout';
import { EventItem } from './EventItem';
import { tToX } from '../../utils/timeScale';

export function EventLayer({ events, viewStart, viewEnd, svgWidth, axisY, onEventClick, wasDragging }) {
  // Recalculate layout once web fonts (Inter) finish loading so text
  // measurements match the actual SVG rendering width.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)); }, []);

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
        />
      ))}
    </g>
  );
}
