import { useState, useCallback, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Controls } from './components/Controls/Controls';
import { OrgChartControls } from './components/Controls/OrgChartControls';
import { Timeline } from './components/Timeline/Timeline';
import { EventEditor } from './components/EventEditor/EventEditor';
import { OrgChart } from './components/OrgChart/OrgChart';
import { PersonEditor } from './components/PersonEditor/PersonEditor';
import { GroupEditor } from './components/GroupEditor/GroupEditor';
import { useViewport } from './hooks/useViewport';
import { useEvents } from './hooks/useEvents';
import { useTimelines } from './hooks/useTimelines';
import { useOrgCharts } from './hooks/useOrgCharts';
import { usePeople } from './hooks/usePeople';
import { useGroups } from './hooks/useGroups';
import { useOrgViewport } from './hooks/useOrgViewport';
import { exportTimelineSvg } from './utils/exportSvg';
import { exportOrgChartSvg, exportOrgChartPng } from './utils/exportOrgChartSvg';
import { computeOrgLayout } from './utils/orgLayout';
import './App.css';

const MIN_TL_HEIGHT = 100;
const DEFAULT_TL_HEIGHT = 320;

export default function App() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('app_mode') || 'timeline'; } catch { return 'timeline'; }
  });

  // Persist mode
  useEffect(() => {
    try { localStorage.setItem('app_mode', mode); } catch { /* ignore */ }
  }, [mode]);

  // ── Timeline state ──
  const { timelines, activeId, switchTimeline, addTimeline, renameTimeline, deleteTimeline, importTimeline } = useTimelines();

  const {
    viewport,
    setSvgWidth,
    svgWidthRef,
    zoomAt,
    panBy,
    zoomIn,
    zoomOut,
    scrollLeft,
    scrollRight,
    goToday,
    savePosition,
    recallPosition,
    hasSavedPosition,
  } = useViewport(activeId);

  const { events, addEvent, updateEvent, deleteEvent } = useEvents(activeId);

  const [editor, setEditor] = useState({ isOpen: false, event: null, defaultStart: null });
  const [showToday, setShowToday] = useState(true);
  const [showWeekends, setShowWeekends] = useState(true);
  const [tlHeight, setTlHeight] = useState(() => viewport.tlHeight ?? DEFAULT_TL_HEIGHT);
  const resizeDragRef = useRef(null);

  // ── Org Chart state ──
  const { charts, activeId: activeChartId, switchChart, addChart, renameChart, deleteChart, importChart } = useOrgCharts();
  const { people, addPerson, updatePerson, deletePerson } = usePeople(activeChartId);
  const { groups, addGroup, updateGroup, deleteGroup, cleanupPerson: cleanupPersonGroups } = useGroups(activeChartId);
  const { viewport: orgViewport, panBy: orgPanBy, panTo: orgPanTo, animatePanTo: orgAnimatePanTo, zoomAt: orgZoomAt, zoomIn: orgZoomIn, zoomOut: orgZoomOut, fitToScreen: orgFitToScreen, resetView: orgResetView } = useOrgViewport(activeChartId);
  const [personEditor, setPersonEditor] = useState({ isOpen: false, person: null });
  const [groupEditor, setGroupEditor] = useState({ isOpen: false, group: null });
  const [focusedPersonId, setFocusedPersonId] = useState(null);
  const [showCardControls, setShowCardControls] = useState(() => {
    try { return localStorage.getItem('orgchart_show_card_controls') !== 'false'; } catch { return true; }
  });
  const [collapsedIds, setCollapsedIds] = useState(() => {
    if (!activeChartId) return new Set();
    try {
      const raw = localStorage.getItem(`orgchart_collapsed_${activeChartId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const orgChartRef = useRef(null);

  // Restore tlHeight when switching timelines
  useEffect(() => {
    setTlHeight(viewport.tlHeight ?? DEFAULT_TL_HEIGHT);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Persist tlHeight into per-timeline viewport storage
  useEffect(() => {
    const key = 'timeline-viewport-' + activeId;
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      data.tlHeight = tlHeight;
      localStorage.setItem(key, JSON.stringify(data));
    } catch { /* ignore */ }
  }, [activeId, tlHeight]);

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

  const activeName = timelines.find(t => t.id === activeId)?.name ?? 'Timeline';

  const handleExportSvg = useCallback(() => {
    exportTimelineSvg({
      events,
      viewport,
      svgWidth: svgWidthRef.current,
      timelineName: activeName,
      showToday,
      showWeekends,
    });
  }, [events, viewport, svgWidthRef, activeName, showToday, showWeekends]);

  // ── Org Chart handlers ──
  const openAddPerson = useCallback(() => {
    setPersonEditor({ isOpen: true, person: null });
  }, []);

  const openEditPerson = useCallback((person) => {
    setPersonEditor({ isOpen: true, person });
  }, []);

  const closePersonEditor = useCallback(() => {
    setPersonEditor(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handlePersonSave = useCallback((data) => {
    if (data.id) {
      updatePerson(data.id, data);
    } else {
      addPerson(data);
    }
    closePersonEditor();
  }, [addPerson, updatePerson, closePersonEditor]);

  const handlePersonDelete = useCallback((id) => {
    deletePerson(id);
    cleanupPersonGroups(id);
    closePersonEditor();
    if (focusedPersonId === id) setFocusedPersonId(null);
  }, [deletePerson, cleanupPersonGroups, closePersonEditor, focusedPersonId]);

  const handleToggleFocus = useCallback((id) => {
    setFocusedPersonId(prev => prev === id ? null : id);
  }, []);

  const handleClearFocus = useCallback(() => {
    setFocusedPersonId(null);
  }, []);

  const handleToggleCollapse = useCallback((personId) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  }, []);

  const handleCreateGroup = useCallback((personIds) => {
    addGroup(personIds, 'Group');
  }, [addGroup]);

  const handleUpdateGroupLabel = useCallback((id, label) => {
    updateGroup(id, { label });
  }, [updateGroup]);

  const handleDeleteGroup = useCallback((id) => {
    deleteGroup(id);
    setGroupEditor(prev => prev.group?.id === id ? { ...prev, isOpen: false } : prev);
  }, [deleteGroup]);

  const openGroupEditor = useCallback((group) => {
    setGroupEditor({ isOpen: true, group });
  }, []);

  const closeGroupEditor = useCallback(() => {
    setGroupEditor(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleGroupSave = useCallback((data) => {
    if (data.id) {
      updateGroup(data.id, { label: data.label, color: data.color });
    }
    closeGroupEditor();
  }, [updateGroup, closeGroupEditor]);

  const handleGroupDelete = useCallback((id) => {
    deleteGroup(id);
    closeGroupEditor();
  }, [deleteGroup, closeGroupEditor]);

  const handleOrgFitToScreen = useCallback((bounds, w, h) => {
    orgFitToScreen(bounds, w, h);
  }, [orgFitToScreen]);

  const handleOrgFitBtn = useCallback(() => {
    const layout = computeOrgLayout(people, focusedPersonId, collapsedIds, groups);
    const el = document.querySelector('.orgchart-wrapper');
    if (el) {
      const rect = el.getBoundingClientRect();
      orgFitToScreen(layout.bounds, rect.width, rect.height);
    }
  }, [people, focusedPersonId, collapsedIds, groups, orgFitToScreen]);

  const activeChartName = charts.find(c => c.id === activeChartId)?.name ?? 'Org Chart';

  const handleExportOrgChartSvg = useCallback(() => {
    exportOrgChartSvg({ people, chartName: activeChartName, focusedPersonId, collapsedIds, groups });
  }, [people, activeChartName, focusedPersonId, collapsedIds, groups]);

  const handleExportOrgChartPng = useCallback(() => {
    exportOrgChartPng({ people, chartName: activeChartName, focusedPersonId, collapsedIds, groups });
  }, [people, activeChartName, focusedPersonId, collapsedIds, groups]);

  const focusedPersonName = focusedPersonId
    ? (() => { const p = people.find(pp => pp.id === focusedPersonId); return p ? `${p.firstName} ${p.lastName}` : ''; })()
    : '';

  // Persist collapsed state
  useEffect(() => {
    if (!activeChartId) return;
    try {
      localStorage.setItem(`orgchart_collapsed_${activeChartId}`, JSON.stringify([...collapsedIds]));
    } catch { /* ignore */ }
  }, [activeChartId, collapsedIds]);

  // Clear focus and restore collapsed state when switching org charts
  useEffect(() => {
    setFocusedPersonId(null);
    try {
      const raw = localStorage.getItem(`orgchart_collapsed_${activeChartId}`);
      setCollapsedIds(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch { setCollapsedIds(new Set()); }
  }, [activeChartId]);

  return (
    <div className="app">
      <Sidebar mode={mode} onModeChange={setMode} />
      <div className="app__main">
        {mode === 'timeline' ? (
          <>
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
              onImportTimeline={importTimeline}
              onExportSvg={handleExportSvg}
              hasEvents={events.length > 0}
              onSavePosition={savePosition}
              onRecallPosition={recallPosition}
              hasSavedPosition={hasSavedPosition}
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
          </>
        ) : (
          <>
            <OrgChartControls
              charts={charts}
              activeChartId={activeChartId}
              onSwitchChart={switchChart}
              onAddChart={addChart}
              onRenameChart={renameChart}
              onDeleteChart={deleteChart}
              onImportChart={importChart}
              hasPeople={people.length > 0}
              onAddPerson={openAddPerson}
              onZoomIn={orgZoomIn}
              onZoomOut={orgZoomOut}
              onFitToScreen={handleOrgFitBtn}
              focusedPersonId={focusedPersonId}
              focusedPersonName={focusedPersonName}
              onClearFocus={handleClearFocus}
              onExportSvg={handleExportOrgChartSvg}
              onExportPng={handleExportOrgChartPng}
              showCardControls={showCardControls}
              onToggleCardControls={() => {
                setShowCardControls(p => {
                  const next = !p;
                  try { localStorage.setItem('orgchart_show_card_controls', String(next)); } catch {};
                  return next;
                });
              }}
              people={people}
              onSelectPerson={(id) => { orgChartRef.current?.selectAndCenter(id); }}
            />
            <OrgChart
              ref={orgChartRef}
              people={people}
              viewport={orgViewport}
              onPan={orgPanBy}
              onPanTo={orgPanTo}
              onAnimatePanTo={orgAnimatePanTo}
              onZoomAt={orgZoomAt}
              onPersonClick={openEditPerson}
              onFitToScreen={handleOrgFitToScreen}
              focusedPersonId={focusedPersonId}
              onClearFocus={handleClearFocus}
              collapsedIds={collapsedIds}
              onToggleCollapse={handleToggleCollapse}
              onToggleFocus={handleToggleFocus}
              showCardControls={showCardControls}
              groups={groups}
              onCreateGroup={handleCreateGroup}
              onUpdateGroupLabel={handleUpdateGroupLabel}
              onDeleteGroup={handleDeleteGroup}
              onGroupClick={openGroupEditor}
            />
            <PersonEditor
              person={personEditor.person}
              isOpen={personEditor.isOpen}
              onSave={handlePersonSave}
              onDelete={handlePersonDelete}
              onClose={closePersonEditor}
              people={people}
            />
            <GroupEditor
              group={groupEditor.group}
              isOpen={groupEditor.isOpen}
              onSave={handleGroupSave}
              onDelete={handleGroupDelete}
              onClose={closeGroupEditor}
              people={people}
            />
          </>
        )}
      </div>
      <span className="app-version">{__APP_VERSION__}</span>
    </div>
  );
}
