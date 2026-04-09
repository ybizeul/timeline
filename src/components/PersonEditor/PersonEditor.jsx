import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { EVENT_COLORS, GRAY_COLORS, DEFAULT_COLOR } from '../../utils/colors';
import { resizeImage } from '../../utils/imageResize';
import './PersonEditor.css';

function makeDraft(person) {
  if (person) {
    return {
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      role: person.role || '',
      company: person.company || '',
      organization: person.organization || '',
      color: person.color || DEFAULT_COLOR,
      reportsTo: person.reportsTo || null,
      dottedReportsTo: person.dottedReportsTo || null,
      photo: person.photo || null,
    };
  }
  return {
    firstName: '',
    lastName: '',
    role: '',
    company: '',
    organization: '',
    color: DEFAULT_COLOR,
    reportsTo: null,
    dottedReportsTo: null,
    photo: null,
  };
}

/** Search-as-you-type field for selecting a person */
function PersonSearchField({ id, label, labelNote, value, onChange, candidates, people }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Resolve selected person for display
  const selected = value ? people.find(p => p.id === value) : null;

  // Filter candidates by query
  const filtered = useMemo(() => {
    if (!query.trim()) return candidates;
    const q = query.toLowerCase();
    return candidates.filter(p => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const role = (p.role || '').toLowerCase();
      return name.includes(q) || role.includes(q);
    });
  }, [candidates, query]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen]);

  // Reset query when value changes externally
  useEffect(() => { setQuery(''); }, [value]);

  const handleSelect = (personId) => {
    onChange(personId);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      e.stopPropagation();
    }
    if (e.key === 'Backspace' && !query && selected) {
      handleClear();
    }
  };

  return (
    <div className="pe-field">
      <label className="pe-label" htmlFor={id}>
        {label}
        {labelNote && <span className="pe-label-note"> {labelNote}</span>}
      </label>
      <div className="pe-search" ref={wrapRef}>
        <div className="pe-search__input-row">
          {selected && !isOpen ? (
            <div className="pe-search__selected" onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
              <span className="pe-search__selected-dot" style={{ background: selected.color || '#6050e0' }} />
              <span className="pe-search__selected-name">
                {selected.firstName} {selected.lastName}
                {selected.role && <span className="pe-search__selected-role"> · {selected.role}</span>}
              </span>
              <button type="button" className="pe-search__clear" onClick={(e) => { e.stopPropagation(); handleClear(); }} title="Clear">×</button>
            </div>
          ) : (
            <input
              ref={inputRef}
              id={id}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
              onFocus={handleInputFocus}
              onKeyDown={handleKeyDown}
              placeholder="Search by name or role…"
              autoComplete="off"
            />
          )}
        </div>
        {isOpen && (
          <div className="pe-search__dropdown">
            <button
              type="button"
              className={`pe-search__option${!value ? ' is-active' : ''}`}
              onClick={() => handleSelect(null)}
            >
              <span className="pe-search__option-none">— None —</span>
            </button>
            {filtered.length === 0 && query && (
              <div className="pe-search__empty">No matches</div>
            )}
            {filtered.map(p => (
              <button
                key={p.id}
                type="button"
                className={`pe-search__option${p.id === value ? ' is-active' : ''}`}
                onClick={() => handleSelect(p.id)}
              >
                <span className="pe-search__option-dot" style={{ background: p.color || '#6050e0' }} />
                <span className="pe-search__option-name">{p.firstName} {p.lastName}</span>
                {p.role && <span className="pe-search__option-role">{p.role}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PersonEditor({ person, isOpen, onSave, onDelete, onClose, people }) {
  const isEdit = Boolean(person);
  const [draft, setDraft] = useState(() => makeDraft(person));
  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    setDraft(makeDraft(person));
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, isOpen]);

  const set = useCallback((field, value) => {
    setDraft(d => ({ ...d, [field]: value }));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!draft.firstName.trim() || !draft.lastName.trim()) return;
    onSave({
      ...(person ?? {}),
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      role: draft.role.trim() || undefined,
      company: draft.company.trim() || undefined,
      organization: draft.organization.trim() || undefined,
      color: draft.color,
      reportsTo: draft.reportsTo || null,
      dottedReportsTo: draft.dottedReportsTo || null,
      photo: draft.photo || null,
    });
    setIsDirty(false);
  }, [draft, person, onSave]);

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

  // Clipboard paste for images
  useEffect(() => {
    if (!isOpen) return;
    const onPaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            try {
              const dataUrl = await resizeImage(blob);
              set('photo', dataUrl);
            } catch { /* ignore invalid images */ }
          }
          return;
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [isOpen, set]);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      set('photo', dataUrl);
    } catch { /* ignore */ }
    e.target.value = '';
  }, [set]);

  const canSave = draft.firstName.trim().length > 0 && draft.lastName.trim().length > 0;

  // Other people for dropdowns (exclude self)
  const otherPeople = people.filter(p => p.id !== person?.id);

  return (
    <>
      <div
        className={`pe-dimmer${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
      />

      <div
        className={`pe-panel${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit person' : 'New person'}
      >
        {/* Header */}
        <div className="pe-header">
          <div className="pe-header__color-dot" style={{ background: draft.color }} />
          <span className="pe-header__title">
            {draft.firstName || draft.lastName
              ? `${draft.firstName} ${draft.lastName}`.trim()
              : (isEdit ? 'Edit person' : 'New person')}
            {isDirty && <span className="pe-unsaved-dot" title="Unsaved changes" />}
          </span>
          <button className="pe-header__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="pe-body" ref={bodyRef}>
          {/* Photo */}
          <div className="pe-field">
            <label className="pe-label">Photo</label>
            <div className="pe-photo-row">
              {draft.photo ? (
                <div className="pe-photo-preview">
                  <img src={draft.photo} alt="Photo" />
                  <button
                    className="pe-photo-remove"
                    onClick={() => set('photo', null)}
                    title="Remove photo"
                  >×</button>
                </div>
              ) : (
                <div className="pe-photo-placeholder">
                  <span>👤</span>
                </div>
              )}
              <div className="pe-photo-actions">
                <button
                  type="button"
                  className="pe-btn pe-btn-ghost pe-btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload
                </button>
                <span className="pe-hint">or paste from clipboard</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="pe-divider" />

          <div className="pe-row">
            <div className="pe-field pe-field--half">
              <label className="pe-label" htmlFor="pe-first">First name</label>
              <input
                id="pe-first"
                type="text"
                value={draft.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                placeholder="First name"
                autoFocus={isOpen && !isEdit}
              />
            </div>
            <div className="pe-field pe-field--half">
              <label className="pe-label" htmlFor="pe-last">Last name</label>
              <input
                id="pe-last"
                type="text"
                value={draft.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="pe-field">
            <label className="pe-label" htmlFor="pe-role">Role</label>
            <input
              id="pe-role"
              type="text"
              value={draft.role}
              onChange={(e) => set('role', e.target.value)}
              placeholder="e.g. VP Engineering"
            />
          </div>

          <div className="pe-row">
            <div className="pe-field pe-field--half">
              <label className="pe-label" htmlFor="pe-company">Company</label>
              <input
                id="pe-company"
                type="text"
                value={draft.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Company"
              />
            </div>
            <div className="pe-field pe-field--half">
              <label className="pe-label" htmlFor="pe-org">Organization</label>
              <input
                id="pe-org"
                type="text"
                value={draft.organization}
                onChange={(e) => set('organization', e.target.value)}
                placeholder="Organization"
              />
            </div>
          </div>

          <div className="pe-divider" />

          <div className="pe-field">
            <label className="pe-label">Color</label>
            <div className="pe-colors">
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`pe-swatch${draft.color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                />
              ))}
              {GRAY_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`pe-swatch${draft.color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                />
              ))}
            </div>
          </div>

          <div className="pe-divider" />

          <PersonSearchField
            id="pe-reports"
            label="Reports to"
            value={draft.reportsTo}
            onChange={(id) => set('reportsTo', id)}
            candidates={otherPeople}
            people={people}
          />

          <PersonSearchField
            id="pe-dotted"
            label="Dotted report to"
            labelNote="(optional)"
            value={draft.dottedReportsTo}
            onChange={(id) => set('dottedReportsTo', id)}
            candidates={otherPeople.filter(p => p.id !== draft.reportsTo)}
            people={people}
          />
        </div>

        {/* Footer */}
        <div className="pe-footer">
          {isEdit && (
            <button
              type="button"
              className="pe-btn pe-btn-delete"
              onClick={() => onDelete(person.id)}
              title="Delete this person"
            >
              Delete
            </button>
          )}
          <button type="button" className="pe-btn pe-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pe-btn pe-btn-primary"
            onClick={handleSave}
            disabled={!canSave}
            title={isEdit ? 'Save changes (⌘↩)' : 'Add person (⌘↩)'}
          >
            {isEdit ? 'Save' : 'Add person'}
          </button>
        </div>
      </div>
    </>
  );
}
