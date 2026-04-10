import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './utils/api';
import { isServerMode } from './utils/runtime';
import './App.css';

const MIN_TL_HEIGHT = 100;
const DEFAULT_TL_HEIGHT = 320;

function getSharedIdFromLocation() {
  try {
    const path = window.location.pathname || '';
    const match = path.match(/^\/s\/([^/]+)\/?$/);
    if (match?.[1]) return decodeURIComponent(match[1]);

    // Backward compatibility with old query-based links.
    const params = new URLSearchParams(window.location.search);
    return params.get('share') || '';
  } catch {
    return '';
  }
}

export default function App() {
  const shareId = useMemo(() => {
    return getSharedIdFromLocation();
  }, []);

  const shareMode = useMemo(() => {
    if (shareId.startsWith('t_')) return 'timeline';
    if (shareId.startsWith('o_')) return 'orgchart';
    return null;
  }, [shareId]);

  const readOnly = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return !!shareId || params.get('readonly') === '1' || params.get('readonly') === 'true';
    } catch {
      return !!shareId;
    }
  }, [shareId]);

  const sharedItemId = useMemo(() => {
    if (!shareMode || !shareId.startsWith('t_') && !shareId.startsWith('o_')) return '';
    return shareId.slice(2);
  }, [shareId, shareMode]);

  const [mode, setMode] = useState(() => {
    if (shareMode) return shareMode;
    try { return localStorage.getItem('app_mode') || 'timeline'; } catch { return 'timeline'; }
  });

  // Persist mode
  useEffect(() => {
    if (shareMode && mode !== shareMode) {
      setMode(shareMode);
      return;
    }
    try { localStorage.setItem('app_mode', mode); } catch { /* ignore */ }
  }, [mode, shareMode]);

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
    setTimelineHeight,
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
  const [smokeStatus, setSmokeStatus] = useState('idle');
  const [smokeMessage, setSmokeMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(isServerMode && !readOnly);
  const [isAuthenticated, setIsAuthenticated] = useState(!isServerMode || readOnly);
  const [authProviders, setAuthProviders] = useState([]);
  const [authError, setAuthError] = useState('');

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

  useEffect(() => {
    if (shareMode !== 'timeline' || !sharedItemId) return;
    if (activeId === sharedItemId) return;
    if (timelines.some((t) => t.id === sharedItemId)) {
      switchTimeline(sharedItemId);
    }
  }, [shareMode, sharedItemId, timelines, activeId, switchTimeline]);

  useEffect(() => {
    if (shareMode !== 'orgchart' || !sharedItemId) return;
    if (activeChartId === sharedItemId) return;
    if (charts.some((c) => c.id === sharedItemId)) {
      switchChart(sharedItemId);
    }
  }, [shareMode, sharedItemId, charts, activeChartId, switchChart]);

  useEffect(() => {
    if (!isServerMode || readOnly) {
      setIsAuthenticated(true);
      setAuthLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAuthState() {
      setAuthLoading(true);
      setAuthError('');
      try {
        const providersRes = await apiGet('/api/auth/providers');
        if (cancelled) return;
        const providers = Array.isArray(providersRes?.providers) ? providersRes.providers : [];
        setAuthProviders(providers);

        try {
          const meRes = await apiGet('/api/auth/me');
          if (cancelled) return;
          setIsAuthenticated(Boolean(meRes?.authenticated));
        } catch {
          if (cancelled) return;
          setIsAuthenticated(false);
        }
      } catch (err) {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : 'Failed to load auth status');
        setAuthProviders([]);
        setIsAuthenticated(false);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    loadAuthState();
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

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

  // Persist timeline height through the viewport hook state backend/local adapter.
  useEffect(() => {
    setTimelineHeight(tlHeight);
  }, [tlHeight, setTimelineHeight]);

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

  const runServerSmokeCheck = useCallback(async () => {
    if (!isServerMode || readOnly || !isAuthenticated || smokeStatus === 'running') return;

    setSmokeStatus('running');
    setSmokeMessage('Running authenticated CRUD checks...');

    const t0 = performance.now();
    const stamp = Date.now();
    let createdTimelineId = '';
    let createdChartId = '';

    try {
      await apiGet('/api/private/whoami');

      const timeline = await apiPost('/api/private/timelines', { name: `Smoke Timeline ${stamp}` });
      createdTimelineId = timeline.id;
      await apiPatch(`/api/private/timelines/${createdTimelineId}`, { name: `Smoke Timeline ${stamp} Renamed` });

      const smokeEvent = {
        id: crypto.randomUUID(),
        title: 'Smoke Event',
        start: new Date(stamp).toISOString(),
        end: new Date(stamp + 3600000).toISOString(),
      };
      await apiPut(`/api/private/timelines/${createdTimelineId}/events`, { events: [smokeEvent] });
      const timelineEvents = await apiGet(`/api/private/timelines/${createdTimelineId}/events`);
      if (!Array.isArray(timelineEvents?.events) || timelineEvents.events.length !== 1) {
        throw new Error('Timeline events round-trip validation failed');
      }

      const smokeViewport = { viewStart: stamp - 86400000, viewEnd: stamp + 86400000, tlHeight: 280 };
      const smokeSavedPos = { viewStart: stamp - 43200000, viewEnd: stamp + 43200000 };
      await apiPut(`/api/private/timelines/${createdTimelineId}/state`, {
        viewport: smokeViewport,
        savedPosition: smokeSavedPos,
      });
      const timelineState = await apiGet(`/api/private/timelines/${createdTimelineId}/state`);
      if (!timelineState || typeof timelineState !== 'object') {
        throw new Error('Timeline state validation failed');
      }

      const chart = await apiPost('/api/private/orgcharts', { name: `Smoke Org ${stamp}` });
      createdChartId = chart.id;
      await apiPatch(`/api/private/orgcharts/${createdChartId}`, { name: `Smoke Org ${stamp} Renamed` });

      const p1 = { id: crypto.randomUUID(), firstName: 'Smoke', lastName: 'One', title: 'Role 1' };
      const p2 = { id: crypto.randomUUID(), firstName: 'Smoke', lastName: 'Two', title: 'Role 2' };
      await apiPut(`/api/private/orgcharts/${createdChartId}/people`, { people: [p1, p2] });
      const peopleRes = await apiGet(`/api/private/orgcharts/${createdChartId}/people`);
      if (!Array.isArray(peopleRes?.people) || peopleRes.people.length !== 2) {
        throw new Error('Org people round-trip validation failed');
      }

      const group = { id: crypto.randomUUID(), personIds: [p1.id, p2.id], label: 'Smoke Group' };
      await apiPut(`/api/private/orgcharts/${createdChartId}/groups`, { groups: [group] });
      const groupsRes = await apiGet(`/api/private/orgcharts/${createdChartId}/groups`);
      if (!Array.isArray(groupsRes?.groups) || groupsRes.groups.length !== 1) {
        throw new Error('Org groups round-trip validation failed');
      }

      await apiPut(`/api/private/orgcharts/${createdChartId}/state`, {
        viewport: { panX: 20, panY: 30, zoom: 1.1 },
        collapsedIds: [p2.id],
        showCardControls: true,
      });
      const orgState = await apiGet(`/api/private/orgcharts/${createdChartId}/state`);
      if (!orgState || typeof orgState !== 'object') {
        throw new Error('Org state validation failed');
      }

      await apiDelete(`/api/private/timelines/${createdTimelineId}`);
      createdTimelineId = '';
      await apiDelete(`/api/private/orgcharts/${createdChartId}`);
      createdChartId = '';

      const elapsedMs = Math.round(performance.now() - t0);
      setSmokeStatus('pass');
      setSmokeMessage(`Smoke check passed in ${elapsedMs}ms`);
    } catch (err) {
      setSmokeStatus('fail');
      setSmokeMessage(err instanceof Error ? err.message : 'Smoke check failed');
    } finally {
      if (createdTimelineId) {
        try { await apiDelete(`/api/private/timelines/${createdTimelineId}`); } catch { /* ignore */ }
      }
      if (createdChartId) {
        try { await apiDelete(`/api/private/orgcharts/${createdChartId}`); } catch { /* ignore */ }
      }
    }
  }, [readOnly, smokeStatus, isAuthenticated]);

  const enabledProviders = useMemo(
    () => authProviders.filter((p) => p && p.enabled && typeof p.id === 'string'),
    [authProviders],
  );

  const providerLabel = useCallback((id) => {
    const map = {
      github: 'GitHub',
      google: 'Google',
      apple: 'Apple',
      facebook: 'Facebook',
      linkedin: 'LinkedIn',
    };
    return map[id] || id;
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', {});
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      setIsAuthenticated(false);
      setSmokeStatus('idle');
      setSmokeMessage('');
    }
  }, []);

  const copyShareLink = useCallback(async (id) => {
    const url = `${window.location.origin}/s/${encodeURIComponent(id)}`;

    try {
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard.');
    } catch {
      prompt('Copy share link:', url);
    }
  }, []);

  const handleShareTimeline = useCallback(() => {
    copyShareLink(`t_${activeId}`);
  }, [copyShareLink, activeId]);

  const handleShareOrgChart = useCallback(() => {
    copyShareLink(`o_${activeChartId}`);
  }, [copyShareLink, activeChartId]);

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
      {!readOnly && <Sidebar mode={mode} onModeChange={setMode} />}
      <div className="app__main">
        {mode === 'timeline' ? (
          <>
            <Controls
              isReadOnly={readOnly}
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
              onAddTimeline={readOnly ? () => {} : addTimeline}
              onRenameTimeline={readOnly ? () => {} : renameTimeline}
              onDeleteTimeline={readOnly ? () => {} : deleteTimeline}
              onImportTimeline={readOnly ? async () => {} : importTimeline}
              onExportSvg={handleExportSvg}
              hasEvents={events.length > 0}
              onSavePosition={savePosition}
              onRecallPosition={recallPosition}
              hasSavedPosition={hasSavedPosition}
              canShowLogout={isServerMode && !readOnly && isAuthenticated}
              onLogout={handleLogout}
              canShare={isServerMode && !readOnly && isAuthenticated}
              onShare={handleShareTimeline}
            />
            <Timeline
              viewport={viewport}
              events={events}
              setSvgWidth={setSvgWidth}
              onWheel={handleWheel}
              onPan={panBy}
              onEventClick={readOnly ? () => {} : openEditEvent}
              showToday={showToday}
              showWeekends={showWeekends}
              height={tlHeight}
            />
            <div className="timeline-resize-handle" onPointerDown={handleResizePointerDown} />
            {!readOnly && (
              <EventEditor
                event={editor.event}
                defaultStart={editor.defaultStart}
                isOpen={editor.isOpen}
                onSave={handleSave}
                onDelete={handleDelete}
                onClose={closeEditor}
              />
            )}
          </>
        ) : (
          <>
            <OrgChartControls
              isReadOnly={readOnly}
              charts={charts}
              activeChartId={activeChartId}
              onSwitchChart={switchChart}
              onAddChart={readOnly ? () => {} : addChart}
              onRenameChart={readOnly ? () => {} : renameChart}
              onDeleteChart={readOnly ? () => {} : deleteChart}
              onImportChart={readOnly ? async () => {} : importChart}
              hasPeople={people.length > 0}
              onAddPerson={readOnly ? () => {} : openAddPerson}
              onZoomIn={orgZoomIn}
              onZoomOut={orgZoomOut}
              onFitToScreen={handleOrgFitBtn}
              focusedPersonId={focusedPersonId}
              focusedPersonName={focusedPersonName}
              onClearFocus={handleClearFocus}
              onExportSvg={handleExportOrgChartSvg}
              onExportPng={handleExportOrgChartPng}
              showCardControls={readOnly ? false : showCardControls}
              onToggleCardControls={() => {
                if (readOnly) return;
                setShowCardControls(p => {
                  const next = !p;
                  try { localStorage.setItem('orgchart_show_card_controls', String(next)); } catch {};
                  return next;
                });
              }}
              people={people}
              onSelectPerson={(id) => { orgChartRef.current?.selectAndCenter(id); }}
              canShowLogout={isServerMode && !readOnly && isAuthenticated}
              onLogout={handleLogout}
              canShare={isServerMode && !readOnly && isAuthenticated}
              onShare={handleShareOrgChart}
            />
            <OrgChart
              ref={orgChartRef}
              people={people}
              viewport={orgViewport}
              onPan={orgPanBy}
              onPanTo={orgPanTo}
              onAnimatePanTo={orgAnimatePanTo}
              onZoomAt={orgZoomAt}
              onPersonClick={readOnly ? () => {} : openEditPerson}
              onFitToScreen={handleOrgFitToScreen}
              focusedPersonId={focusedPersonId}
              onClearFocus={handleClearFocus}
              collapsedIds={collapsedIds}
              onToggleCollapse={handleToggleCollapse}
              onToggleFocus={handleToggleFocus}
              showCardControls={readOnly ? false : showCardControls}
              groups={groups}
              onCreateGroup={readOnly ? () => {} : handleCreateGroup}
              onUpdateGroupLabel={readOnly ? () => {} : handleUpdateGroupLabel}
              onDeleteGroup={readOnly ? () => {} : handleDeleteGroup}
              onGroupClick={readOnly ? () => {} : openGroupEditor}
            />
            {!readOnly && (
              <PersonEditor
                person={personEditor.person}
                isOpen={personEditor.isOpen}
                onSave={handlePersonSave}
                onDelete={handlePersonDelete}
                onClose={closePersonEditor}
                people={people}
              />
            )}
            {!readOnly && (
              <GroupEditor
                group={groupEditor.group}
                isOpen={groupEditor.isOpen}
                onSave={handleGroupSave}
                onDelete={handleGroupDelete}
                onClose={closeGroupEditor}
                people={people}
              />
            )}
          </>
        )}
      </div>
      {isServerMode && !readOnly && isAuthenticated && (
        <div className="smoke-check">
          <button
            className={`smoke-check__btn smoke-check__btn--${smokeStatus}`}
            onClick={runServerSmokeCheck}
            disabled={smokeStatus === 'running'}
            title="Run authenticated server smoke checks"
          >
            {smokeStatus === 'running' ? 'Running smoke check...' : 'Run server smoke check'}
          </button>
          {smokeMessage && <span className="smoke-check__status">{smokeMessage}</span>}
        </div>
      )}
      {isServerMode && !readOnly && !isAuthenticated && !authLoading && (
        <div className="auth-gate" role="dialog" aria-modal="true" aria-label="Login required">
          <div className="auth-gate__card">
            <h2 className="auth-gate__title">Login Required</h2>
            <p className="auth-gate__text">Sign in to access private timelines and org charts.</p>
            {enabledProviders.length > 0 ? (
              <div className="auth-gate__actions">
                {enabledProviders.map((provider) => (
                  <button
                    key={provider.id}
                    className="auth-gate__btn"
                    onClick={() => {
                      window.location.href = `/api/auth/${provider.id}/start`;
                    }}
                  >
                    Continue with {providerLabel(provider.id)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="auth-gate__hint">
                No OAuth provider is enabled. Configure at least one OAUTH_* credential in .env.server, then restart the Go server.
              </p>
            )}
            {authError && <p className="auth-gate__error">{authError}</p>}
          </div>
        </div>
      )}
      <span className="app-version">{__APP_VERSION__}</span>
    </div>
  );
}
