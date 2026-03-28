import { useMemo } from 'react';
import { layoutEvents } from '../../utils/eventLayout';
import { EventItem } from './EventItem';

export function EventLayer({ events, viewStart, viewEnd, svgWidth, axisY, onEventClick, wasDragging }) {
  const laid = useMemo(
    () => {
      const items = layoutEvents(events, viewStart, viewEnd, svgWidth);
      // Render higher lanes first so lower-lane events (and their connectors)
      // paint on top — connectors from higher lanes pass under lower-lane events.
      return [...items].sort((a, b) => b.lane - a.lane);
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
