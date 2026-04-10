import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { IconLink } from '@tabler/icons-react';
import { OrgChartMenu } from './OrgChartMenu';
import './Controls.css';

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/></svg>
);

function ToolbarSearch({ people, onSelect }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return people;
    const q = query.toLowerCase();
    return people.filter(p => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const role = (p.role || '').toLowerCase();
      return name.includes(q) || role.includes(q);
    });
  }, [people, query]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) { setIsOpen(false); setMobileOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const handleSelect = useCallback((person) => {
    onSelect(person.id);
    setQuery('');
    setIsOpen(false);
    setMobileOpen(false);
  }, [onSelect]);

  const handleFocus = () => { setIsOpen(true); };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setIsOpen(false); setMobileOpen(false); e.stopPropagation(); }
    if (e.key === 'Enter' && filtered.length > 0) { handleSelect(filtered[0]); }
  };

  const toggleMobile = () => {
    setMobileOpen(o => {
      if (!o) setTimeout(() => inputRef.current?.focus(), 0);
      else { setIsOpen(false); setQuery(''); }
      return !o;
    });
  };

  // Catch Cmd/Ctrl+F to focus search field
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setMobileOpen(true);
        setIsOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="toolbar-search" ref={wrapRef}>
      <button
        className="ctrl-btn toolbar-search__mobile-btn"
        onClick={toggleMobile}
        title="Search people"
      ><SearchIcon /></button>
      <div className={`toolbar-search__field${mobileOpen ? ' is-mobile-open' : ''}`}>
        <span className="toolbar-search__icon"><SearchIcon /></span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
          autoComplete="off"
        />
      </div>
      {isOpen && people.length > 0 && (
        <div className="toolbar-search__dropdown">
          {filtered.length === 0 && query && (
            <div className="toolbar-search__empty">No matches</div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              className="toolbar-search__option"
              onClick={() => handleSelect(p)}
            >
              <span className="toolbar-search__option-dot" style={{ background: p.color || '#6050e0' }} />
              <span className="toolbar-search__option-name">{p.firstName} {p.lastName}</span>
              {p.role && <span className="toolbar-search__option-role">{p.role}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgChartControls({
  isReadOnly,
  canShare,
  onShare,
  shareFeedbackMessage,
  shareFeedbackTone,
  charts, activeChartId, onSwitchChart, onAddChart, onRenameChart, onDeleteChart, onImportChart,
  hasPeople, onAddPerson, onZoomIn, onZoomOut, onFitToScreen,
  focusedPersonId, focusedPersonName, onClearFocus, onExportSvg, onExportPng,
  showCardControls, onToggleCardControls,
  people, onSelectPerson,
}) {
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
      <OrgChartMenu
        isReadOnly={isReadOnly}
        charts={charts}
        activeId={activeChartId}
        onSwitch={onSwitchChart}
        onAdd={onAddChart}
        onRename={onRenameChart}
        onDelete={onDeleteChart}
        onImport={onImportChart}
        onExportSvg={onExportSvg}
        onExportPng={onExportPng}
        hasPeople={hasPeople}
      />
      {!isReadOnly && canShare && (
        <>
          <div className="controls__share-wrap">
            <button className="ctrl-btn" onClick={onShare} title="Share org chart" aria-label="Share org chart">
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

      <div className="controls__secondary">
        <button className="ctrl-btn" onClick={onZoomIn} title="Zoom in">+</button>
        <button className="ctrl-btn" onClick={onZoomOut} title="Zoom out">−</button>
        <div className="controls__sep" />
      </div>
      <button className="ctrl-btn ctrl-btn--text" onClick={onFitToScreen} title="Fit to screen">Fit</button>

      <div className="controls__secondary">
        <div className="controls__sep" />
        {!isReadOnly && (
          <button
            className={`ctrl-btn ctrl-btn--text ctrl-btn--toggle${showCardControls ? ' is-active' : ''}`}
            onClick={onToggleCardControls}
            title={showCardControls ? 'Hide card controls' : 'Show card controls'}
          >
            Controls
          </button>
        )}
      </div>

      {focusedPersonId && (
        <div className="controls__secondary">
          <div className="controls__sep" />
          <span className="controls__period" style={{ minWidth: 'auto' }}>
            Focused: {focusedPersonName}
          </span>
          <button className="ctrl-btn ctrl-btn--text" onClick={onClearFocus} title="Show all">Show all</button>
        </div>
      )}

      {/* Overflow menu — visible only on mobile */}
      <div className="controls__overflow" ref={overflowRef}>
        <button
          className="ctrl-btn controls__overflow-btn"
          onClick={() => setOverflowOpen(o => !o)}
          title="More options"
        >⋯</button>
        {overflowOpen && (
          <div className="controls__overflow-dropdown">
            {!isReadOnly && (
              <button
                className={`controls__overflow-item${showCardControls ? ' is-active' : ''}`}
                onClick={() => { onToggleCardControls(); }}
              >
                Card controls
              </button>
            )}
            {focusedPersonId && (
              <>
                <div className="controls__overflow-divider" />
                <button className="controls__overflow-item" onClick={() => { onClearFocus(); setOverflowOpen(false); }}>
                  Show all (unfocus)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {people.length > 0 && (
        <ToolbarSearch people={people} onSelect={onSelectPerson} />
      )}

      <div className="controls__spacer" />
      {!isReadOnly && (
        <>
          <button className="ctrl-btn ctrl-btn--accent" onClick={onAddPerson}>
            <span>+</span> <span className="controls__add-label">Add person</span>
          </button>
        </>
      )}
    </div>
  );
}
