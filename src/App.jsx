import { useState, useCallback, useRef } from 'react';
import { Controls } from './components/Controls/Controls';
import { Timeline } from './components/Timeline/Timeline';
import { EventEditor } from './components/EventEditor/EventEditor';
import { useViewport } from './hooks/useViewport';
import { useEvents } from './hooks/useEvents';
import { useTimelines } from './hooks/useTimelines';
import './App.css';

const MIN_TL_HEIGHT = 100;
const DEFAULT_TL_HEIGHT = 320;

export default function App() {
  const {
    viewport,
    setSvgWidth,
    zoomAt,
    panBy,
    zoomIn,
    zoomOut,
    scrollLeft,
    scrollRight,
    goToday,
  } = useViewport();

  const { timelines, activeId, switchTimeline, addTimeline, renameTimeline, deleteTimeline } = useTimelines();

  const { events, addEvent, updateEvent, deleteEvent } = useEvents(activeId);

  const [editor, setEditor] = useState({ isOpen: false, event: null, defaultStart: null });
  const [showToday, setShowToday] = useState(true);
  const [showWeekends, setShowWeekends] = useState(true);
  const [tlHeight, setTlHeight] = useState(DEFAULT_TL_HEIGHT);
  const resizeDragRef = useRef(null);

  const handleResizePointerDown = useCallback((e) => {
    e.preventDefault();
    resizeDragRef.current = { startY: e.clientY, startH: tlHeight };
    const onMove = (ev) => {
      const delta = ev.clientY - resizeDragRef.current.startY;
      setTlHeight(Math.max(MIN_TL_HEIGHT, resizeDragRef.current.startH + delta));
    };
    const onUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [tlHeight]);

  // Wheel zoom — called from Timeline
  const handleWheel = useCallback((cursorX, factor) => {
    zoomAt(cursorX, factor);
  }, [zoomAt]);

  const openAddEvent = useCallback(() => {
    const { viewStart, viewEnd } = viewport;
    const center = new Date((viewStart + viewEnd) / 2).toISOString();
    setEditor({ isOpen: true, event: null, defaultStart: center });
  }, [viewport]);

  const openEditEvent = useCallback((event) => {
    setEditor({ isOpen: true, event, defaultStart: null });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleSave = useCallback((data) => {
    if (data.id) {
      updateEvent(data.id, data);
    } else {
      addEvent(data);
    }
    closeEditor();
  }, [addEvent, updateEvent, closeEditor]);

  const handleDelete = useCallback((id) => {
    deleteEvent(id);
    closeEditor();
  }, [deleteEvent, closeEditor]);

  return (
    <div className="app">
      <Controls
        viewport={viewport}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onScrollLeft={scrollLeft}
        onScrollRight={scrollRight}
        onToday={goToday}
        onAddEvent={openAddEvent}
        showToday={showToday}
        onToggleToday={() => setShowToday(v => !v)}
        showWeekends={showWeekends}
        onToggleWeekends={() => setShowWeekends(v => !v)}
        timelines={timelines}
        activeTimelineId={activeId}
        onSwitchTimeline={switchTimeline}
        onAddTimeline={addTimeline}
        onRenameTimeline={renameTimeline}
        onDeleteTimeline={deleteTimeline}
      />
      <Timeline
        viewport={viewport}
        events={events}
        setSvgWidth={setSvgWidth}
        onWheel={handleWheel}
        onPan={panBy}
        onEventClick={openEditEvent}
        showToday={showToday}
        showWeekends={showWeekends}
        height={tlHeight}
      />
      <div className="timeline-resize-handle" onPointerDown={handleResizePointerDown} />
      <EventEditor
        event={editor.event}
        defaultStart={editor.defaultStart}
        isOpen={editor.isOpen}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={closeEditor}
      />
    </div>
  );
}
