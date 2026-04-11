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
  const [shareFeedback, setShareFeedback] = useState({ target: '', tone: 'success', message: '' });
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
  const [tlHeight, setTlHeight] = useState(() => {
    const restored = Number(viewport.tlHeight);
    return Number.isFinite(restored) && restored >= MIN_TL_HEIGHT ? restored : DEFAULT_TL_HEIGHT;
  });
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
    const restored = Number(viewport.tlHeight);
    setTlHeight(Number.isFinite(restored) && restored >= MIN_TL_HEIGHT ? restored : DEFAULT_TL_HEIGHT);
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
  const showOrgCardControls = readOnly ? true : showCardControls;

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

  const renderProviderIcon = useCallback((id) => {
    if (id === 'github') {
      return (
        <svg className="auth-gate__provider-logo auth-gate__provider-logo--svg" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 0.5C5.37 0.5 0 5.88 0 12.52c0 5.3 3.44 9.8 8.2 11.38c0.6 0.12 0.82-0.26 0.82-0.58c0-0.29-0.01-1.05-0.02-2.06c-3.34 0.73-4.04-1.61-4.04-1.61c-0.55-1.39-1.33-1.76-1.33-1.76c-1.08-0.74 0.08-0.73 0.08-0.73c1.2 0.08 1.82 1.24 1.82 1.24c1.06 1.82 2.79 1.29 3.47 0.98c0.11-0.77 0.42-1.29 0.76-1.59c-2.67-0.3-5.48-1.34-5.48-5.95c0-1.31 0.47-2.38 1.24-3.22c-0.12-0.3-0.54-1.52 0.12-3.16c0 0 1.01-0.32 3.3 1.23c0.96-0.27 1.98-0.41 3-0.42c1.02 0.01 2.04 0.15 3 0.42c2.28-1.55 3.29-1.23 3.29-1.23c0.66 1.64 0.25 2.86 0.12 3.16c0.77 0.84 1.24 1.91 1.24 3.22c0 4.62-2.81 5.64-5.49 5.94c0.43 0.37 0.82 1.1 0.82 2.23c0 1.61-0.01 2.91-0.01 3.3c0 0.32 0.22 0.71 0.83 0.58c4.76-1.58 8.19-6.08 8.19-11.38C24 5.88 18.63 0.5 12 0.5z"
          />
        </svg>
      );
    }
    if (id === 'google') {
      return (
        <svg className="auth-gate__provider-logo auth-gate__provider-logo--svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-0.2 1.2-1.4 3.5-5.5 3.5c-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2 0.8 3.9 1.5l2.7-2.6C16.8 2.9 14.6 2 12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.7-4.1 9.7-9.8c0-0.7-0.1-1.3-0.2-1.9H12z" />
        </svg>
      );
    }
    if (id === 'apple') {
      return (
        <svg className="auth-gate__provider-logo auth-gate__provider-logo--svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M16.37 12.2c0.02 2.43 2.13 3.24 2.15 3.25c-0.02 0.06-0.34 1.17-1.12 2.32c-0.68 1-1.38 2-2.49 2.02c-1.09 0.02-1.44-0.65-2.69-0.65c-1.25 0-1.64 0.63-2.67 0.67c-1.08 0.04-1.91-1.08-2.6-2.08c-1.41-2.04-2.48-5.77-1.04-8.27c0.71-1.24 1.99-2.02 3.37-2.04c1.05-0.02 2.05 0.71 2.69 0.71c0.64 0 1.83-0.88 3.09-0.75c0.53 0.02 2 0.21 2.95 1.6c-0.08 0.05-1.76 1.03-1.74 3.22zM14.23 6.1c0.57-0.69 0.95-1.64 0.84-2.6c-0.82 0.03-1.82 0.55-2.41 1.24c-0.53 0.61-0.99 1.58-0.87 2.51c0.91 0.07 1.85-0.47 2.44-1.15z" />
        </svg>
      );
    }
    if (id === 'facebook') {
      return (
        <svg className="auth-gate__provider-logo auth-gate__provider-logo--svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.43H7.08v-3.5h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7c1.31 0 2.68 0.24 2.68 0.24v2.97h-1.51c-1.49 0-1.95 0.93-1.95 1.88v2.26h3.32l-0.53 3.5h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
        </svg>
      );
    }
    if (id === 'linkedin') {
      return (
        <svg className="auth-gate__provider-logo auth-gate__provider-logo--svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.58c0-1.33-0.03-3.03-1.85-3.03c-1.85 0-2.13 1.44-2.13 2.93v5.68H9.35V9h3.42v1.56h0.05c0.48-0.9 1.64-1.85 3.38-1.85c3.62 0 4.29 2.38 4.29 5.48v6.26zM5.34 7.43a2.07 2.07 0 1 1 0-4.14a2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45z" />
        </svg>
      );
    }
    return null;
  }, []);

  const handleLoginOpen = useCallback(() => {
    if (enabledProviders.length === 1) {
      window.location.href = `/api/auth/${enabledProviders[0].id}/start`;
      return;
    }
    setShowLoginModal(true);
  }, [enabledProviders]);

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

  const copyShareLink = useCallback(async (id, target) => {
    const url = `${window.location.origin}/s/${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback({ target, tone: 'success', message: 'Link copied' });
    } catch {
      setShareFeedback({ target, tone: 'error', message: 'Clipboard blocked' });
    }
  }, []);

  const handleShareTimeline = useCallback(() => {
    copyShareLink(`t_${activeId}`, 'timeline');
  }, [copyShareLink, activeId]);

  const handleShareOrgChart = useCallback(() => {
    copyShareLink(`o_${activeChartId}`, 'orgchart');
  }, [copyShareLink, activeChartId]);

  useEffect(() => {
    if (!shareFeedback.target || !shareFeedback.message) return;
    const timer = window.setTimeout(() => {
      setShareFeedback({ target: '', tone: 'success', message: '' });
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

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
      {!readOnly && (
        <Sidebar
          mode={mode}
          onModeChange={setMode}
          canShowLogout={isServerMode && isAuthenticated}
          onLogout={handleLogout}
          canShowLogin={isServerMode && !isAuthenticated && !authLoading}
          onLogin={handleLoginOpen}
        />
      )}
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
              canShare={isServerMode && !readOnly && isAuthenticated}
              onShare={handleShareTimeline}
              shareFeedbackMessage={shareFeedback.target === 'timeline' ? shareFeedback.message : ''}
              shareFeedbackTone={shareFeedback.tone}
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
              showCardControls={showOrgCardControls}
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
              canShare={isServerMode && !readOnly && isAuthenticated}
              onShare={handleShareOrgChart}
              shareFeedbackMessage={shareFeedback.target === 'orgchart' ? shareFeedback.message : ''}
              shareFeedbackTone={shareFeedback.tone}
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
              showCardControls={showOrgCardControls}
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
        <div className="anon-notice" role="status" aria-live="polite" aria-label="Local browser mode notice">
          <p className="anon-notice__text">
            You are not logged in, data will be stored in browser. You can log in to persist data on server.
          </p>
          <button className="anon-notice__btn" onClick={() => setShowAnonModeModal(false)}>
            OK
          </button>
        </div>
      )}
      {isServerMode && !readOnly && showLoginModal && !isAuthenticated && (
        <div className="auth-gate" role="dialog" aria-modal="true" aria-label="Log in">
          <div className="auth-gate__card">
            <button className="auth-gate__close" aria-label="Close" onClick={() => setShowLoginModal(false)}>
              ×
            </button>
            <h2 className="auth-gate__title">Log In</h2>
            <p className="auth-gate__text">Choose an authentication provider.</p>
            {enabledProviders.length > 0 ? (
              <div className="auth-gate__provider-grid">
                {enabledProviders.map((provider) => (
                  <div key={provider.id} className="auth-gate__provider-item">
                    <button
                      className="auth-gate__provider-btn"
                      onClick={() => handleLoginProvider(provider.id)}
                      aria-label={`Continue with ${providerLabel(provider.id)}`}
                      title={`Continue with ${providerLabel(provider.id)}`}
                    >
                      <span className="auth-gate__provider-logo-wrap">
                        <span className="auth-gate__provider-fallback" aria-hidden="true" />
                        {renderProviderIcon(provider.id)}
                      </span>
                    </button>
                    <span className="auth-gate__provider-name">{providerLabel(provider.id)}</span>
                  </div>
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
