import { useMemo, useState, useRef, useEffect } from 'react';
import { IconLink } from '@tabler/icons-react';
import { formatDate } from '../../utils/locale';
import { TimelineMenu } from './TimelineMenu';
import './Controls.css';

function formatPeriod(viewStart, viewEnd) {
  const start = new Date(viewStart);
  const end = new Date(viewEnd);
  const durationMs = viewEnd - viewStart;
  const durationDays = durationMs / (1000 * 3600 * 24);

  if (durationDays > 365 * 2) {
    return `${formatDate(start, 'yyyy')} – ${formatDate(end, 'yyyy')}`;
  }
  if (durationDays > 60) {
    return `${formatDate(start, 'MMM yyyy')} – ${formatDate(end, 'MMM yyyy')}`;
  }
  if (durationDays > 7) {
    return `${formatDate(start, 'MMM d')} – ${formatDate(end, 'MMM d, yyyy')}`;
  }
  return `${formatDate(start, 'MMM d')} – ${formatDate(end, 'MMM d, yyyy')}`;
}

export function Controls({ viewport, onZoomIn, onZoomOut, onScrollLeft, onScrollRight, onToday, onAddEvent,
  isReadOnly,
  canShare,
  onShare,
  shareFeedbackMessage,
  shareFeedbackTone,
  showToday, onToggleToday,
  showWeekends, onToggleWeekends,
  timelines, activeTimelineId, onSwitchTimeline, onAddTimeline, onRenameTimeline, onDeleteTimeline, onImportTimeline,
  onExportSvg, hasEvents,
  onSavePosition, onRecallPosition, hasSavedPosition }) {
  const { viewStart, viewEnd } = viewport;
  const periodLabel = useMemo(() => formatPeriod(viewStart, viewEnd), [viewStart, viewEnd]);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef(null);

  useEffect(() => {
    if (!overflowOpen) return;
    function onMouseDown(e) {
      if (!overflowRef.current?.contains(e.target)) setOverflowOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [overflowOpen]);

  return (
    <div className="controls">
      <TimelineMenu
        isReadOnly={isReadOnly}
        timelines={timelines}
        activeId={activeTimelineId}
        onSwitch={onSwitchTimeline}
        onAdd={onAddTimeline}
        onRename={onRenameTimeline}
        onDelete={onDeleteTimeline}
        onImport={onImportTimeline}
        onExportSvg={onExportSvg}
        hasEvents={hasEvents}
      />
      {!isReadOnly && canShare && (
        <>
          <div className="controls__share-wrap">
            <button className="ctrl-btn" onClick={onShare} title="Share timeline" aria-label="Share timeline">
              <IconLink size={16} stroke={1.8} aria-hidden="true" />
            </button>
            {!!shareFeedbackMessage && (
              <div
                className={`controls__share-popover${shareFeedbackTone === 'error' ? ' is-error' : ''}`}
                role="status"
                aria-live="polite"
              >
                {shareFeedbackMessage}
              </div>
            )}
          </div>
        </>
      )}
      <div className="controls__sep" />

      {/* Secondary controls — hidden on mobile, shown in overflow menu instead */}
      <div className="controls__secondary">
        <button className="ctrl-btn ctrl-btn--text" onClick={onScrollLeft} title="Scroll left">‹</button>
        <button className="ctrl-btn ctrl-btn--text" onClick={onScrollRight} title="Scroll right">›</button>
        <div className="controls__sep" />
      </div>

      <div className="controls__secondary">
        <button className="ctrl-btn" onClick={onZoomIn} title="Zoom in">+</button>
        <button className="ctrl-btn" onClick={onZoomOut} title="Zoom out">−</button>
        <div className="controls__sep" />
      </div>
      <button className="ctrl-btn ctrl-btn--text" onClick={onToday} title="Go to today">Today</button>
      <div className="controls__sep" />
      <div className="controls__secondary">
        <div className="ctrl-btn-group">
          <button className="ctrl-btn ctrl-btn--text" onClick={onSavePosition} title="Save current view position">Save View</button>
          <button className="ctrl-btn ctrl-btn--text" onClick={onRecallPosition} title="Restore saved view position" disabled={!hasSavedPosition}>Restore View</button>
        </div>
      </div>

      {/* Toggle controls — hidden on mobile, in overflow menu */}
      <div className="controls__secondary">
        <button
          className={`ctrl-btn ctrl-btn--text ctrl-btn--toggle${showToday ? ' is-active' : ''}`}
          onClick={onToggleToday}
          title={showToday ? 'Hide today marker' : 'Show today marker'}
        >
          today
        </button>
        <button
          className={`ctrl-btn ctrl-btn--text ctrl-btn--toggle${showWeekends ? ' is-active' : ''}`}
          onClick={onToggleWeekends}
          title={showWeekends ? 'Hide weekend highlights' : 'Show weekend highlights'}
        >
          weekends
        </button>
      </div>

      {/* Overflow menu — visible only on mobile */}
      <div className="controls__overflow" ref={overflowRef}>
        <button
          className="ctrl-btn controls__overflow-btn"
          onClick={() => setOverflowOpen(o => !o)}
          title="More options"
        >⋯</button>
        {overflowOpen && (
          <div className="controls__overflow-dropdown">
            <button className="controls__overflow-item" onClick={() => { onScrollLeft(); }}>‹ Scroll left</button>
            <button className="controls__overflow-item" onClick={() => { onScrollRight(); }}>› Scroll right</button>
            <div className="controls__overflow-divider" />
            <button
              className={`controls__overflow-item${showToday ? ' is-active' : ''}`}
              onClick={() => { onToggleToday(); }}
            >
              Today marker
            </button>
            <button
              className={`controls__overflow-item${showWeekends ? ' is-active' : ''}`}
              onClick={() => { onToggleWeekends(); }}
            >
              Weekends
            </button>
            <div className="controls__overflow-divider" />
            <button className="controls__overflow-item" onClick={() => { onSavePosition(); }}>Save View</button>
            <button className="controls__overflow-item" onClick={() => { onRecallPosition(); }} disabled={!hasSavedPosition}>Restore View</button>
          </div>
        )}
      </div>

      <span className="controls__period">{periodLabel}</span>
      <div className="controls__spacer" />
      {!isReadOnly && (
        <>
          <button className="ctrl-btn ctrl-btn--accent" onClick={onAddEvent}>
            <span>+</span> <span className="controls__add-label">Add event</span>
          </button>
        </>
      )}
    </div>
  );
}
