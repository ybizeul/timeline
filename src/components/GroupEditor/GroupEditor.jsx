import { useState, useEffect, useCallback } from 'react';
import { EVENT_COLORS } from '../../utils/colors';
import './GroupEditor.css';

const DEFAULT_GROUP_COLOR = '#606080';

function makeDraft(group) {
  if (group) {
    return {
      label: group.label || '',
      color: group.color || DEFAULT_GROUP_COLOR,
    };
  }
  return { label: '', color: DEFAULT_GROUP_COLOR };
}

export function GroupEditor({ group, isOpen, onSave, onDelete, onClose, people }) {
  const [draft, setDraft] = useState(() => makeDraft(group));
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setDraft(makeDraft(group));
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, isOpen]);

  const set = useCallback((field, value) => {
    setDraft(d => ({ ...d, [field]: value }));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!draft.label.trim()) return;
    onSave({
      ...group,
      label: draft.label.trim(),
      color: draft.color,
    });
    setIsDirty(false);
  }, [draft, group, onSave]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, handleSave]);

  const canSave = draft.label.trim().length > 0;

  // Resolve member people
  const members = (group?.personIds || [])
    .map(id => people.find(p => p.id === id))
    .filter(Boolean);

  return (
    <>
      <div
        className={`ge-dimmer${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
      />

      <div
        className={`ge-panel${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Edit group"
      >
        {/* Header */}
        <div className="ge-header">
          <div className="ge-header__color-dot" style={{ background: draft.color }} />
          <span className="ge-header__title">
            {draft.label || 'Edit group'}
            {isDirty && <span className="ge-unsaved-dot" title="Unsaved changes" />}
          </span>
          <button className="ge-header__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="ge-body">
          <div className="ge-field">
            <label className="ge-label" htmlFor="ge-label">Title</label>
            <input
              id="ge-label"
              type="text"
              value={draft.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Group name"
              autoFocus={isOpen}
            />
          </div>

          <div className="ge-divider" />

          <div className="ge-field">
            <label className="ge-label">Color</label>
            <div className="ge-colors">
              <button
                type="button"
                className={`ge-swatch${draft.color === DEFAULT_GROUP_COLOR ? ' is-selected' : ''}`}
                style={{ background: DEFAULT_GROUP_COLOR }}
                onClick={() => set('color', DEFAULT_GROUP_COLOR)}
                title="Default"
              />
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`ge-swatch${draft.color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                />
              ))}
            </div>
          </div>

          {members.length > 0 && (
            <>
              <div className="ge-divider" />
              <div className="ge-field">
                <label className="ge-label">Members ({members.length})</label>
                <div className="ge-members">
                  {members.map(p => (
                    <div key={p.id} className="ge-member">
                      <span className="ge-member__dot" style={{ background: p.color || '#6050e0' }} />
                      <span className="ge-member__name">{p.firstName} {p.lastName}</span>
                      {p.role && <span className="ge-member__role">{p.role}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="ge-footer">
          <button
            className="ge-btn ge-btn-primary"
            onClick={handleSave}
            disabled={!canSave || !isDirty}
          >
            Save
          </button>
          <button className="ge-btn ge-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {group && (
            <button
              className="ge-btn ge-btn-danger"
              onClick={() => onDelete(group.id)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </>
  );
}
