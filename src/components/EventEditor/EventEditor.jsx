import { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { EVENT_COLORS, GRAY_COLORS, DEFAULT_COLOR } from '../../utils/colors';
import { EVENT_STYLES, DEFAULT_EVENT_STYLE } from '../Timeline/EventItem';
import './EventEditor.css';

function toDate(isoOrNull) {
  if (!isoOrNull) return null;
  try { return new Date(isoOrNull); } catch { return null; }
}

function fromDate(d) {
  if (!d) return null;
  return d.toISOString();
}

function makeDraft(event, defaultStart) {
  if (event) {
    return {
      title: event.title,
      startDate: toDate(event.startDate),
      endDate: toDate(event.endDate),
      color: event.color ?? DEFAULT_COLOR,
      align: event.align ?? 'left',
      style: event.style ?? DEFAULT_EVENT_STYLE,
      description: event.description ?? '',
      showNotes: event.showNotes ?? false,
    };
  }
  return {
    title: '',
    startDate: toDate(defaultStart) ?? new Date(),
    endDate: null,
    color: DEFAULT_COLOR,
    align: 'left',
    style: DEFAULT_EVENT_STYLE,
    description: '',
    showNotes: false,
  };
}

export function EventEditor({ event, defaultStart, isOpen, onSave, onDelete, onClose }) {
  const isEdit = Boolean(event);
  const [draft, setDraft] = useState(() => makeDraft(event, defaultStart));
  const [isDirty, setIsDirty] = useState(false);

  // Reset draft when the target event changes
  useEffect(() => {
    setDraft(makeDraft(event, defaultStart));
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, isOpen]);

  const set = useCallback((field, value) => {
    setDraft(d => ({ ...d, [field]: value }));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!draft.title.trim() || !draft.startDate) return;
    onSave({
      ...(event ?? {}),
      title: draft.title.trim(),
      startDate: fromDate(draft.startDate),
      endDate: draft.endDate ? fromDate(draft.endDate) : null,
      color: draft.color,
      align: draft.align,
      style: draft.style,
      showNotes: draft.showNotes,
      description: draft.description.trim() || undefined,
    });
    setIsDirty(false);
  }, [draft, event, onSave]);

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

  const canSave = draft.title.trim().length > 0 && draft.startDate != null;

  return (
    <>
      {/* Dimmer behind the panel */}
      <div
        className={`event-editor-dimmer${isOpen ? ' is-open' : ''}`}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={`event-editor-panel${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit event' : 'New event'}
      >
        {/* Header */}
        <div className="ee-header">
          <div className="ee-header__color-dot" style={{ background: draft.color }} />
          <span className="ee-header__title">
            {draft.title || (isEdit ? 'Edit event' : 'New event')}
            {isDirty && <span className="ee-unsaved-dot" title="Unsaved changes" />}
          </span>
          <button className="ee-header__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="ee-body">
          <div className="ee-field">
            <label className="ee-label" htmlFor="ee-title">Title</label>
            <input
              id="ee-title"
              type="text"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Event name…"
              autoFocus={isOpen && !isEdit}
            />
          </div>

          <div className="ee-field">
            <label className="ee-label" htmlFor="ee-start">Start</label>
            <DatePicker
              id="ee-start"
              selected={draft.startDate}
              onChange={(d) => set('startDate', d)}
              showTimeSelect
              timeIntervals={15}
              timeFormat="HH:mm"
              dateFormat="dd/MM/yyyy HH:mm"
              className="ee-datepicker-input"
              portalId="datepicker-portal"
            />
          </div>

          <div className="ee-field">
            <label className="ee-label" htmlFor="ee-end">
              End{' '}
              <span className="ee-label-note">(optional)</span>
            </label>
            <DatePicker
              id="ee-end"
              selected={draft.endDate}
              onChange={(d) => set('endDate', d)}
              showTimeSelect
              timeIntervals={15}
              timeFormat="HH:mm"
              dateFormat="dd/MM/yyyy HH:mm"
              minDate={draft.startDate}
              className="ee-datepicker-input"
              isClearable
              portalId="datepicker-portal"
            />
          </div>

          <div className="ee-divider" />

          <div className="ee-field">
            <label className="ee-label">Color</label>
            <div className="ee-colors">
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`ee-swatch${draft.color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                  aria-label={c}
                  title={c}
                />
              ))}
              {GRAY_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`ee-swatch${draft.color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                  aria-label={c}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div className="ee-divider" />

          <div className="ee-field">
            <label className="ee-label">Display style</label>
            <div className="ee-align">
              {EVENT_STYLES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`ee-align-btn${draft.style === id ? ' is-selected' : ''}`}
                  onClick={() => set('style', id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="ee-field">
            <label className="ee-label">Alignment</label>
            <div className="ee-align">
              {[['left', '⬝▬▬', 'Left — rect starts at date'],
                ['center', '▬⬝▬', 'Center — rect centered on date'],
                ['right', '▬▬⬝', 'Right — rect ends at date']].map(([val, icon, tip]) => (
                <button
                  key={val}
                  type="button"
                  className={`ee-align-btn${draft.align === val ? ' is-selected' : ''}`}
                  onClick={() => set('align', val)}
                  title={tip}
                >
                  {val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="ee-divider" />

          <div className="ee-field">
            <label className="ee-label" htmlFor="ee-desc">
              Notes{' '}
              <span className="ee-label-note">(optional)</span>
            </label>
            <textarea
              id="ee-desc"
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Add a note…"
              style={{ resize: 'vertical' }}
            />
            <label className="ee-checkbox-label">
              <input
                type="checkbox"
                checked={draft.showNotes && Boolean(draft.description)}
                disabled={!draft.description}
                onChange={(e) => set('showNotes', e.target.checked)}
              />
              Show on timeline
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="ee-footer">
          {isEdit && (
            <button
              type="button"
              className="ee-btn ee-btn-delete"
              onClick={() => onDelete(event.id)}
              title="Delete this event"
            >
              Delete
            </button>
          )}
          <button type="button" className="ee-btn ee-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ee-btn ee-btn-primary"
            onClick={handleSave}
            disabled={!canSave}
            title={isEdit ? 'Save changes (⌘↩)' : 'Add event (⌘↩)'}
          >
            {isEdit ? 'Save' : 'Add event'}
          </button>
        </div>
      </div>
    </>
  );
}
