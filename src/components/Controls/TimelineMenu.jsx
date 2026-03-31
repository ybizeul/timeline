import { useState, useRef, useEffect } from 'react';
import { exportTimeline } from '../../utils/io';
import './TimelineMenu.css';

export function TimelineMenu({ timelines, activeId, onSwitch, onAdd, onRename, onDelete, onImport, onExportSvg, hasEvents }) {
  const [isOpen, setIsOpen]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const menuRef  = useRef(null);
  const inputRef = useRef(null);
  const fileRef  = useRef(null);

  const activeName = timelines.find(t => t.id === activeId)?.name ?? 'Timeline';

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e) {
      if (!menuRef.current?.contains(e.target)) {
        setIsOpen(false);
        setEditingId(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen]);

  // Focus the rename input as soon as it appears
  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  function startEdit(tl) {
    setEditingId(tl.id);
    setEditName(tl.name);
  }

  function commitEdit() {
    if (editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  }

  function handleDelete(tl) {
    if (window.confirm(`Delete "${tl.name}" and all its events?`)) {
      onDelete(tl.id);
    }
  }

  return (
    <div className="tl-menu" ref={menuRef}>
      <button
        className="ctrl-btn ctrl-btn--text tl-menu__trigger"
        onClick={() => { setIsOpen(o => !o); setEditingId(null); }}
        title="Switch timeline"
      >
        <span className="tl-menu__label">{activeName}</span>
        <span className="tl-menu__chevron">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="tl-menu__dropdown">
          {timelines.map(tl => (
            <div
              key={tl.id}
              className={`tl-menu__row${tl.id === activeId ? ' tl-menu__row--active' : ''}`}
            >
              {editingId === tl.id ? (
                <input
                  ref={inputRef}
                  className="tl-menu__input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={commitEdit}
                />
              ) : (
                <span
                  className="tl-menu__name"
                  onClick={() => { onSwitch(tl.id); setIsOpen(false); }}
                >
                  {tl.name}
                </span>
              )}

              <div className="tl-menu__actions">
                <button
                  className="tl-menu__icon-btn"
                  title="Rename"
                  onClick={() => startEdit(tl)}
                >✎</button>
                {timelines.length > 1 && (
                  <button
                    className="tl-menu__icon-btn tl-menu__icon-btn--danger"
                    title="Delete"
                    onClick={() => handleDelete(tl)}
                  >✕</button>
                )}
              </div>
            </div>
          ))}

          <div className="tl-menu__divider" />

          <button
            className="tl-menu__add"
            onClick={() => { onAdd('New Timeline'); setIsOpen(false); }}
          >
            + New timeline
          </button>

          <div className="tl-menu__divider" />

          <div className="tl-menu__io-row">
            <button
              className="tl-menu__io-btn"
              onClick={() => { exportTimeline(activeId); setIsOpen(false); }}
            >
              Export
            </button>
            <button
              className="tl-menu__io-btn"
              disabled={!hasEvents}
              onClick={() => { onExportSvg(); setIsOpen(false); }}
              title={hasEvents ? 'Export timeline as SVG image' : 'No events to export'}
            >
              Export SVG
            </button>
            <button
              className="tl-menu__io-btn"
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await onImport(file);
              } catch (err) {
                alert(err.message);
              }
              e.target.value = '';
              setIsOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
