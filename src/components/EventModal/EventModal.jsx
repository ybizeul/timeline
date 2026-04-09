import { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { EVENT_COLORS, GRAY_COLORS, DEFAULT_COLOR } from '../../utils/colors';
import './EventModal.css';

function toDate(isoOrNull) {
  if (!isoOrNull) return null;
  try { return new Date(isoOrNull); } catch { return null; }
}

function fromDate(d) {
  if (!d) return null;
  return d.toISOString();
}

export function EventModal({ event, defaultStart, onSave, onDelete, onClose }) {
  const isEdit = Boolean(event);

  const [title, setTitle] = useState(event?.title ?? '');
  const [startDate, setStartDate] = useState(
    event ? toDate(event.startDate) : (toDate(defaultStart) ?? new Date())
  );
  const [endDate, setEndDate] = useState(event ? toDate(event.endDate) : null);
  const [color, setColor] = useState(event?.color ?? DEFAULT_COLOR);
  const [description, setDescription] = useState(event?.description ?? '');

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!title.trim() || !startDate) return;
    onSave({
      ...(event ?? {}),
      title: title.trim(),
      startDate: fromDate(startDate),
      endDate: endDate ? fromDate(endDate) : null,
      color,
      description: description.trim() || undefined,
    });
  }, [title, startDate, endDate, color, description, event, onSave]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal__header">
          <h2 className="modal__title" id="modal-title">
            {isEdit ? 'Edit event' : 'New event'}
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="modal__field">
            <label className="modal__label" htmlFor="ev-title">Title</label>
            <input
              id="ev-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name…"
              autoFocus
              required
            />
          </div>

          <div className="modal__dates">
            <div className="modal__field">
              <label className="modal__label" htmlFor="ev-start">Start</label>
              <DatePicker
                id="ev-start"
                selected={startDate}
                onChange={(d) => setStartDate(d)}
                showTimeSelect
                timeIntervals={15}
                timeFormat="HH:mm"
                dateFormat="dd/MM/yyyy HH:mm"
                className="modal-datepicker-input"
                portalId="datepicker-portal"
                required
              />
            </div>
            <div className="modal__field">
              <label className="modal__label" htmlFor="ev-end">End (optional)</label>
              <DatePicker
                id="ev-end"
                selected={endDate}
                onChange={(d) => setEndDate(d)}
                showTimeSelect
                timeIntervals={15}
                timeFormat="HH:mm"
                dateFormat="dd/MM/yyyy HH:mm"
                minDate={startDate}
                className="modal-datepicker-input"
                isClearable
                portalId="datepicker-portal"
              />
            </div>
          </div>

          <div className="modal__field">
            <label className="modal__label">Color</label>
            <div className="modal__colors">
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                  title={c}
                />
              ))}
              {GRAY_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${color === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div className="modal__field">
            <label className="modal__label" htmlFor="ev-desc">Description (optional)</label>
            <textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add a note…"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="modal__actions">
            {isEdit && (
              <button type="button" className="btn btn-danger" onClick={() => onDelete(event.id)}>
                Delete
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? 'Save changes' : 'Add event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
