import { useMemo } from 'react';
import { layoutEvents } from '../../utils/eventLayout';
import { EventItem } from './EventItem';

export function EventLayer({ events, viewStart, viewEnd, svgWidth, axisY, onEventClick, wasDragging }) {
  const laid = useMemo(
    () => {
      const items = layoutEvents(events, viewStart, viewEnd, svgWidth);
      // Render higher events first so lower events (and their connectors)
      // paint on top — connectors from higher events pass under lower ones.
      return [...items].sort((a, b) => b.yOffset - a.yOffset);
    },
    [events, viewStart, viewEnd, svgWidth]
  );

  return (
    <g className="event-layer">
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
