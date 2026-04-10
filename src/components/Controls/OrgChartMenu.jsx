import { useState, useRef, useEffect } from 'react';
import { exportOrgChart } from '../../utils/orgChartIo';

export function OrgChartMenu({ charts, activeId, onSwitch, onAdd, onRename, onDelete, onImport, onExportSvg, onExportPng, hasPeople, isReadOnly = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  const activeName = charts.find(c => c.id === activeId)?.name ?? 'Org Chart';

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

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  function startEdit(chart) {
    setEditingId(chart.id);
    setEditName(chart.name);
  }

  function commitEdit() {
    if (editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  }

  function requestDelete(chart) {
    setDeleteTarget(chart);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
    setIsOpen(false);
  }

  return (
    <div className="tl-menu" ref={menuRef}>
      <button
        className="ctrl-btn ctrl-btn--text tl-menu__trigger"
        onClick={() => { setIsOpen(o => !o); setEditingId(null); }}
        title="Switch org chart"
      >
        <span className="tl-menu__label">{activeName}</span>
        <span className="tl-menu__chevron">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen && (
        <div className="tl-menu__dropdown">
          {charts.map(chart => (
            <div
              key={chart.id}
              className={`tl-menu__row${chart.id === activeId ? ' tl-menu__row--active' : ''}`}
            >
              {editingId === chart.id ? (
                <input
                  ref={inputRef}
                  className="tl-menu__input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={commitEdit}
                />
              ) : (
                <span
                  className="tl-menu__name"
                  onClick={() => { onSwitch(chart.id); setIsOpen(false); }}
                >
                  {chart.name}
                </span>
              )}

              {!isReadOnly && (
                <div className="tl-menu__actions">
                  <button className="tl-menu__icon-btn" title="Rename" onClick={() => startEdit(chart)}>✎</button>
                  {charts.length > 1 && (
                    <button
                      className="tl-menu__icon-btn tl-menu__icon-btn--danger"
                      title="Delete"
                      onClick={() => requestDelete(chart)}
                    >✕</button>
                  )}
                </div>
              )}
            </div>
          ))}

          {!isReadOnly && (
            <>
              <div className="tl-menu__divider" />

              <button
                className="tl-menu__add"
                onClick={() => { onAdd('New Org Chart'); setIsOpen(false); }}
              >
                + New org chart
              </button>
            </>
          )}

          <div className="tl-menu__divider" />

          <div className="tl-menu__section-label">Export / Import</div>
          <button
            className="tl-menu__item"
            onClick={() => { exportOrgChart(activeId); setIsOpen(false); }}
          >
            Export JSON
          </button>
          <button
            className="tl-menu__item"
            disabled={!hasPeople}
            onClick={() => { onExportSvg(); setIsOpen(false); }}
            title={hasPeople ? 'Export org chart as SVG image' : 'No people to export'}
          >
            Export SVG
          </button>
          <button
            className="tl-menu__item"
            disabled={!hasPeople}
            onClick={() => { onExportPng(); setIsOpen(false); }}
            title={hasPeople ? 'Export org chart as PNG image' : 'No people to export'}
          >
            Export PNG
          </button>
          {!isReadOnly && (
            <>
              <button
                className="tl-menu__item"
                onClick={() => fileRef.current?.click()}
              >
                Import
              </button>
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
            </>
          )}
        </div>
      )}

      {deleteTarget && (
        <div
          className="tl-menu__dialog-backdrop"
          role="presentation"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="tl-menu__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Delete org chart"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="tl-menu__dialog-title">Delete org chart?</h3>
            <p className="tl-menu__dialog-text">
              Delete "{deleteTarget.name}" and all its people?
            </p>
            <div className="tl-menu__dialog-actions">
              <button className="tl-menu__dialog-btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="tl-menu__dialog-btn tl-menu__dialog-btn--danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
