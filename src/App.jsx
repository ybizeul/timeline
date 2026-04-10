import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Controls } from './components/Controls/Controls';
import { OrgChartControls } from './components/Controls/OrgChartControls';
import { Timeline } from './components/Timeline/Timeline';
import { EventEditor } from './components/EventEditor/EventEditor';
import { OrgChart } from './components/OrgChart/OrgChart';
import { PersonEditor } from './components/PersonEditor/PersonEditor';
import { GroupEditor } from './components/GroupEditor/GroupEditor';
import { useViewportStable as useViewport } from './hooks/useViewport';
import { useEvents } from './hooks/useEvents';
import { useTimelines } from './hooks/useTimelines';
import { useOrgCharts } from './hooks/useOrgCharts';
import { usePeople } from './hooks/usePeople';
import { useGroups } from './hooks/useGroups';
import { useOrgViewportStable as useOrgViewport } from './hooks/useOrgViewport';
import { exportTimelineSvg } from './utils/exportSvg';
import { exportOrgChartSvg, exportOrgChartPng } from './utils/exportOrgChartSvg';
import { computeOrgLayout } from './utils/orgLayout';
import { apiGet, apiPost, apiPut } from './utils/api';
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

  const [authLoading, setAuthLoading] = useState(isServerMode && !readOnly);
  const [isAuthenticated, setIsAuthenticated] = useState(!isServerMode || readOnly);
  const [authProviders, setAuthProviders] = useState([]);
  const [authError, setAuthError] = useState('');
  const [authUserId, setAuthUserId] = useState('');
  const [showAnonModeModal, setShowAnonModeModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [shareDialog, setShareDialog] = useState({ isOpen: false, url: '', copied: false, copyError: '' });
  const migrationRunningRef = useRef(false);

  const useServerData = isServerMode && (readOnly || isAuthenticated);

  // ── Timeline state ──
  const { timelines, activeId, switchTimeline, addTimeline, renameTimeline, deleteTimeline, importTimeline } = useTimelines(useServerData);

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
  } = useViewport(activeId, useServerData);

  const { events, addEvent, updateEvent, deleteEvent } = useEvents(activeId, useServerData);

  const [editor, setEditor] = useState({ isOpen: false, event: null, defaultStart: null });
  const [showToday, setShowToday] = useState(true);
  const [showWeekends, setShowWeekends] = useState(true);
  const [tlHeight, setTlHeight] = useState(() => viewport.tlHeight ?? DEFAULT_TL_HEIGHT);
  const resizeDragRef = useRef(null);

  // ── Org Chart state ──
  const { charts, activeId: activeChartId, switchChart, addChart, renameChart, deleteChart, importChart } = useOrgCharts(useServerData);
  const { people, addPerson, updatePerson, deletePerson } = usePeople(activeChartId, useServerData);
  const { groups, addGroup, updateGroup, deleteGroup, cleanupPerson: cleanupPersonGroups } = useGroups(activeChartId, useServerData);
  const { viewport: orgViewport, panBy: orgPanBy, panTo: orgPanTo, animatePanTo: orgAnimatePanTo, zoomAt: orgZoomAt, zoomIn: orgZoomIn, zoomOut: orgZoomOut, fitToScreen: orgFitToScreen, resetView: orgResetView } = useOrgViewport(activeChartId, useServerData);
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
      setAuthUserId('');
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
          const authenticated = Boolean(meRes?.authenticated);
          setIsAuthenticated(authenticated);
          setAuthUserId(authenticated ? (meRes?.user?.localUserId || '') : '');
        } catch {
          if (cancelled) return;
          setIsAuthenticated(false);
          setAuthUserId('');
        }
      } catch (err) {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : 'Failed to load auth status');
        setAuthProviders([]);
        setIsAuthenticated(false);
        setAuthUserId('');
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    loadAuthState();
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

  useEffect(() => {
    if (!isServerMode || readOnly || authLoading) {
      setShowAnonModeModal(false);
      return;
    }
    if (isAuthenticated) {
      setShowAnonModeModal(false);
      return;
    }
    setShowAnonModeModal(true);
  }, [authLoading, isAuthenticated, readOnly]);

  useEffect(() => {
    if (isAuthenticated) {
      setShowLoginModal(false);
    }
  }, [isAuthenticated]);

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

  const handleLoginOpen = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const handleLoginProvider = useCallback((providerId) => {
    window.location.href = `/api/auth/${providerId}/start`;
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', {});
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      setIsAuthenticated(false);
      setAuthUserId('');
    }
  }, []);

  const migrateLocalDataToServer = useCallback(async () => {
    if (!isServerMode || readOnly || !isAuthenticated || !authUserId) return;
    const migrationKey = `server_migration_done_${authUserId}`;
    if (localStorage.getItem(migrationKey) === '1') return;
    if (migrationRunningRef.current) return;
    migrationRunningRef.current = true;

    const parse = (key) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    try {
      const timelines = parse('timelines_index');
      const timelineList = Array.isArray(timelines) && timelines.length > 0 ? timelines : [{ id: 'default', name: 'My Timeline' }];

      for (const tl of timelineList) {
        const events = parse(`timeline_events_${tl.id}`) || (tl.id === 'default' ? (parse('timeline_events') || []) : []);
        const viewportState = parse(`timeline-viewport-${tl.id}`) || null;
        const savedPosition = parse(`timeline-savedpos-${tl.id}`) || null;
        const hasData = (Array.isArray(events) && events.length > 0)
          || !!viewportState
          || !!savedPosition
          || (tl.id !== 'default' || (tl.name && tl.name !== 'My Timeline'));
        if (!hasData) continue;

        const created = await apiPost('/api/private/timelines', { name: tl.name || 'My Timeline' });
        await apiPut(`/api/private/timelines/${created.id}/events`, { events: Array.isArray(events) ? events : [] });
        await apiPut(`/api/private/timelines/${created.id}/state`, {
          viewport: viewportState || {},
          savedPosition: savedPosition || {},
        });
      }

      const charts = parse('orgcharts_index');
      const chartList = Array.isArray(charts) && charts.length > 0 ? charts : [{ id: 'default-org', name: 'My Org Chart' }];
      const showCardControls = localStorage.getItem('orgchart_show_card_controls') !== 'false';

      for (const chart of chartList) {
        const peopleData = parse(`orgchart_people_${chart.id}`);
        const groupsData = parse(`orgchart_groups_${chart.id}`);
        const viewportData = parse(`orgchart-viewport-${chart.id}`);
        const collapsed = parse(`orgchart_collapsed_${chart.id}`);
        const peopleList = Array.isArray(peopleData) ? peopleData : [];
        const groupsList = Array.isArray(groupsData) ? groupsData : [];
        const collapsedIds = Array.isArray(collapsed) ? collapsed : [];

        const hasData = peopleList.length > 0
          || groupsList.length > 0
          || !!viewportData
          || collapsedIds.length > 0
          || (chart.id !== 'default-org' || (chart.name && chart.name !== 'My Org Chart'));
        if (!hasData) continue;

        const created = await apiPost('/api/private/orgcharts', { name: chart.name || 'My Org Chart' });
        await apiPut(`/api/private/orgcharts/${created.id}/people`, { people: peopleList });
        await apiPut(`/api/private/orgcharts/${created.id}/groups`, { groups: groupsList });
        await apiPut(`/api/private/orgcharts/${created.id}/state`, {
          viewport: viewportData || {},
          collapsedIds,
          showCardControls,
        });
      }

      localStorage.setItem(migrationKey, '1');
    } catch (err) {
      console.error('Failed to migrate local data to server', err);
    } finally {
      migrationRunningRef.current = false;
    }
  }, [authUserId, isAuthenticated, readOnly]);

  useEffect(() => {
    migrateLocalDataToServer();
  }, [migrateLocalDataToServer]);

  const openShareDialog = useCallback((id) => {
    const url = `${window.location.origin}/s/${encodeURIComponent(id)}`;
    setShareDialog({ isOpen: true, url, copied: false, copyError: '' });
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareDialog.url) return;
    try {
      await navigator.clipboard.writeText(shareDialog.url);
      setShareDialog((prev) => ({ ...prev, copied: true, copyError: '' }));
    } catch {
      setShareDialog((prev) => ({ ...prev, copied: false, copyError: 'Clipboard access blocked. Copy the link manually below.' }));
    }
  }, [shareDialog.url]);

  const closeShareDialog = useCallback(() => {
    setShareDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleShareTimeline = useCallback(() => {
    openShareDialog(`t_${activeId}`);
  }, [openShareDialog, activeId]);

  const handleShareOrgChart = useCallback(() => {
    openShareDialog(`o_${activeChartId}`);
  }, [openShareDialog, activeChartId]);

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
              canShowLogin={isServerMode && !readOnly && !isAuthenticated && !authLoading}
              onLogin={handleLoginOpen}
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
              canShowLogin={isServerMode && !readOnly && !isAuthenticated && !authLoading}
              onLogin={handleLoginOpen}
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
      {isServerMode && !readOnly && showAnonModeModal && (
        <div className="auth-gate" role="dialog" aria-modal="true" aria-label="Local browser mode notice">
          <div className="auth-gate__card">
            <h2 className="auth-gate__title">Local Browser Mode</h2>
            <p className="auth-gate__text">
              You are using local browser mode. Your data is stored in this browser only.
            </p>
            <p className="auth-gate__hint">
              Log in to persist data server-side and access it across devices.
            </p>
            <div className="auth-gate__actions" style={{ marginTop: 12 }}>
              <button className="auth-gate__btn" onClick={() => setShowAnonModeModal(false)}>
                Continue in Local Mode
              </button>
              <button className="auth-gate__btn" onClick={() => { setShowAnonModeModal(false); setShowLoginModal(true); }}>
                Log In
              </button>
            </div>
          </div>
        </div>
      )}
      {isServerMode && !readOnly && showLoginModal && !isAuthenticated && (
        <div className="auth-gate" role="dialog" aria-modal="true" aria-label="Log in">
          <div className="auth-gate__card">
            <h2 className="auth-gate__title">Log In</h2>
            <p className="auth-gate__text">Choose an authentication provider.</p>
            {enabledProviders.length > 0 ? (
              <div className="auth-gate__actions">
                {enabledProviders.map((provider) => (
                  <button
                    key={provider.id}
                    className="auth-gate__btn"
                    onClick={() => handleLoginProvider(provider.id)}
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
            <div className="auth-gate__actions" style={{ marginTop: 12 }}>
              <button className="auth-gate__btn" onClick={() => setShowLoginModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {shareDialog.isOpen && (
        <div className="auth-gate" role="dialog" aria-modal="true" aria-label="Share link" onClick={closeShareDialog}>
          <div className="auth-gate__card" onClick={(e) => e.stopPropagation()}>
            <h2 className="auth-gate__title">Share Link</h2>
            <p className="auth-gate__text">Use this link to share read-only access.</p>
            <input
              className="auth-gate__input"
              readOnly
              value={shareDialog.url}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.currentTarget.select()}
            />
            {shareDialog.copied && <p className="auth-gate__hint">Link copied to clipboard.</p>}
            {shareDialog.copyError && <p className="auth-gate__error">{shareDialog.copyError}</p>}
            <div className="auth-gate__actions" style={{ marginTop: 12 }}>
              <button className="auth-gate__btn" onClick={handleCopyShareLink}>
                Copy link
              </button>
              <button className="auth-gate__btn" onClick={closeShareDialog}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <span className="app-version">{__APP_VERSION__}</span>
    </div>
  );
}
