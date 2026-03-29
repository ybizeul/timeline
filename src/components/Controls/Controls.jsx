import { useMemo } from 'react';
import { format } from 'date-fns';
import { TimelineMenu } from './TimelineMenu';
import './Controls.css';

function formatPeriod(viewStart, viewEnd) {
  const start = new Date(viewStart);
  const end = new Date(viewEnd);
  const durationMs = viewEnd - viewStart;
  const durationDays = durationMs / (1000 * 3600 * 24);

  if (durationDays > 365 * 2) {
    return `${format(start, 'yyyy')} – ${format(end, 'yyyy')}`;
  }
  if (durationDays > 60) {
    return `${format(start, 'MMM yyyy')} – ${format(end, 'MMM yyyy')}`;
  }
  if (durationDays > 7) {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

export function Controls({ viewport, onZoomIn, onZoomOut, onScrollLeft, onScrollRight, onToday, onAddEvent,
  showToday, onToggleToday,
  showWeekends, onToggleWeekends,
  timelines, activeTimelineId, onSwitchTimeline, onAddTimeline, onRenameTimeline, onDeleteTimeline }) {
  const { viewStart, viewEnd } = viewport;
  const periodLabel = useMemo(() => formatPeriod(viewStart, viewEnd), [viewStart, viewEnd]);

  return (
    <div className="controls">
      <TimelineMenu
        timelines={timelines}
        activeId={activeTimelineId}
        onSwitch={onSwitchTimeline}
        onAdd={onAddTimeline}
        onRename={onRenameTimeline}
        onDelete={onDeleteTimeline}
      />
      <div className="controls__sep" />
      <button className="ctrl-btn ctrl-btn--text" onClick={onScrollLeft} title="Scroll left">‹</button>
      <button className="ctrl-btn ctrl-btn--text" onClick={onScrollRight} title="Scroll right">›</button>
      <div className="controls__sep" />
      <button className="ctrl-btn" onClick={onZoomIn} title="Zoom in">+</button>
      <button className="ctrl-btn" onClick={onZoomOut} title="Zoom out">−</button>
      <div className="controls__sep" />
      <button className="ctrl-btn ctrl-btn--text" onClick={onToday} title="Go to today">Today</button>
      <button
        className={`ctrl-btn ctrl-btn--text${showToday ? ' is-active' : ''}`}
        onClick={onToggleToday}
        title={showToday ? 'Hide today marker' : 'Show today marker'}
      >
        {showToday ? '⊘ marker' : '⊕ marker'}
      </button>
      <button
        className={`ctrl-btn ctrl-btn--text${showWeekends ? ' is-active' : ''}`}
        onClick={onToggleWeekends}
        title={showWeekends ? 'Hide weekend highlights' : 'Show weekend highlights'}
      >
        {showWeekends ? '⊘ weekends' : '⊕ weekends'}
      </button>
      <span className="controls__period">{periodLabel}</span>
      <div className="controls__spacer" />
      <button className="ctrl-btn ctrl-btn--accent" onClick={onAddEvent}>
        <span>+</span> Add event
      </button>
    </div>
  );
}
