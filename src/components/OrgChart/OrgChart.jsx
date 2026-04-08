import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { computeOrgLayout, CARD_W, CARD_H } from '../../utils/orgLayout';
import { PersonCard } from './PersonCard';
import { OrgConnectors } from './OrgConnectors';
import { GroupOverlays } from './GroupOverlays';
import './OrgChart.css';

const ZOOM_SENSITIVITY = 0.003;
const DRAG_THRESHOLD = 4;

export function OrgChart({ people, viewport, onPan, onPanTo, onZoomAt, onPersonClick, onFitToScreen, focusedPersonId, onClearFocus, collapsedIds, onToggleCollapse, onToggleFocus, showCardControls, groups, onCreateGroup, onUpdateGroupLabel, onDeleteGroup }) {
  const wrapperRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Track container size
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute layout
  const layout = useMemo(
    () => computeOrgLayout(people, focusedPersonId, collapsedIds, groups),
    [people, focusedPersonId, collapsedIds, groups]
  );

  // Build a position lookup for edges
  const nodePositions = useMemo(() => {
    const map = new Map();
    for (const n of layout.nodes) {
      map.set(n.person.id, n);
    }
    return map;
  }, [layout.nodes]);

  // Pan to show tree on focus change, keeping focused card visible
  useEffect(() => {
    if (size.w <= 0 || size.h <= 0 || people.length === 0) return;
    const { bounds } = layout;
    if (!bounds) return;
    const z = viewport.zoom;
    const pad = 40;

    // Ideal pan: center the whole tree bounds
    let panX = size.w / 2 - ((bounds.minX + bounds.maxX) / 2) * z;
    let panY = size.h / 2 - ((bounds.minY + bounds.maxY) / 2) * z;

    // If a person is focused, ensure their card is visible
    if (focusedPersonId) {
      const node = nodePositions.get(focusedPersonId);
      if (node) {
        // Card screen bounds with candidate pan
        const cardLeft = node.x * z + panX;
        const cardRight = (node.x + CARD_W) * z + panX;
        const cardTop = node.y * z + panY;
        const cardBottom = (node.y + CARD_H) * z + panY;

        // Clamp so focused card is within the viewport with padding
        if (cardLeft < pad) panX += pad - cardLeft;
        else if (cardRight > size.w - pad) panX -= cardRight - (size.w - pad);
        if (cardTop < pad) panY += pad - cardTop;
        else if (cardBottom > size.h - pad) panY -= cardBottom - (size.h - pad);
      }
    }

    onPanTo(panX, panY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPersonId]);

  // Pointer drag for panning — use window listeners so clicks on cards still propagate
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0 || pinchRef.current) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (!dragRef.current.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      dragRef.current.moved = true;
      dragRef.current.startX = ev.clientX;
      dragRef.current.startY = ev.clientY;
      onPan(dx, dy);
    };

    const onUp = () => {
      // Keep dragRef.current alive briefly so handleCardClick can read .moved
      const wasDrag = dragRef.current?.moved;
      // Clear after a microtask so onClick (which fires after pointerup) can still see it
      setTimeout(() => { dragRef.current = null; }, 0);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [onPan]);

  // Wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const factor = 1 - e.deltaY * ZOOM_SENSITIVITY;
    onZoomAt(cursorX, cursorY, factor);
  }, [onZoomAt]);

  // Attach wheel as non-passive
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Touch pinch-to-zoom + two-finger pan
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const center = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        dragRef.current = null;
        pinchRef.current = { dist: dist(e.touches[0], e.touches[1]), center: center(e.touches[0], e.touches[1]) };
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const c = center(e.touches[0], e.touches[1]);
        const rect = el.getBoundingClientRect();
        const anchorX = c.x - rect.left;
        const anchorY = c.y - rect.top;
        onZoomAt(anchorX, anchorY, d / pinchRef.current.dist);
        onPan(c.x - pinchRef.current.center.x, c.y - pinchRef.current.center.y);
        pinchRef.current = { dist: d, center: c };
      }
    };
    const onTouchEnd = () => { pinchRef.current = null; };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onZoomAt, onPan]);

  const handleCardClick = useCallback((person, e) => {
    // Only fire click if we didn't drag
    if (dragRef.current?.moved) return;
    // Single click toggles selection
    setSelectedIds(prev => {
      const next = new Set(e?.shiftKey ? prev : []);
      if (next.has(person.id)) next.delete(person.id);
      else next.add(person.id);
      return next;
    });
  }, []);

  const handleCardDoubleClick = useCallback((person) => {
    setSelectedIds(new Set());
    onPersonClick(person);
  }, [onPersonClick]);

  const handleCreateGroup = useCallback(() => {
    if (selectedIds.size < 2) return;
    onCreateGroup([...selectedIds]);
    setSelectedIds(new Set());
  }, [selectedIds, onCreateGroup]);

  // Clear selection on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const focusedPerson = focusedPersonId ? people.find(p => p.id === focusedPersonId) : null;

  const handleBackgroundClick = useCallback((e) => {
    // Only clear if click was directly on the SVG/wrapper (not a card) and not a drag
    if (!dragRef.current?.moved && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [selectedIds.size]);

  return (
    <div
      className="orgchart-wrapper"
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onClick={handleBackgroundClick}
    >
      {people.length === 0 && (
        <div className="orgchart-empty">
          <div className="orgchart-empty__icon">👥</div>
          <div>No people yet. Add someone to get started.</div>
        </div>
      )}

      {focusedPerson && (
        <div className="orgchart-focus-banner">
          <span>Focused on</span>
          <span className="orgchart-focus-banner__name">
            {focusedPerson.firstName} {focusedPerson.lastName}
          </span>
          <button className="orgchart-focus-banner__btn" onClick={onClearFocus}>
            Show all
          </button>
        </div>
      )}

      <svg className="orgchart-svg" width={size.w} height={size.h}>
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          <GroupOverlays
            groups={groups}
            nodePositions={nodePositions}
            onUpdateLabel={(id, label) => onUpdateGroupLabel(id, label)}
            onDelete={onDeleteGroup}
          />
          <OrgConnectors edges={layout.edges} nodePositions={nodePositions} />
          {layout.nodes.map(n => (
            <PersonCard
              key={n.person.id}
              person={n.person}
              x={n.x}
              y={n.y}
              onClick={handleCardClick}
              onDoubleClick={handleCardDoubleClick}
              hasChildren={n.hasChildren}
              isCollapsed={n.isCollapsed}
              onToggleCollapse={onToggleCollapse}
              isFocused={focusedPersonId === n.person.id}
              onToggleFocus={onToggleFocus}
              showControls={showCardControls}
              isSelected={selectedIds.has(n.person.id)}
            />
          ))}
        </g>
      </svg>

      {selectedIds.size >= 2 && (
        <button
          className="orgchart-create-group-btn"
          onClick={handleCreateGroup}
        >
          Create Group ({selectedIds.size})
        </button>
      )}
    </div>
  );
}
