const ALLOWED_EVENT_FIELDS = ['title', 'startDate', 'endDate', 'color', 'align', 'style', 'showNotes', 'description'];
const REQUIRED_EVENT_FIELDS = ['title', 'startDate'];

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'timeline';
}

/** Export the active timeline as a JSON file download. */
export function exportTimeline(activeId) {
  const indexRaw = localStorage.getItem('timelines_index');
  const timelines = indexRaw ? JSON.parse(indexRaw) : [];
  const tl = timelines.find(t => t.id === activeId);
  const name = tl?.name ?? 'Timeline';

  const eventsRaw = localStorage.getItem(`timeline_events_${activeId}`);
  const events = eventsRaw ? JSON.parse(eventsRaw) : [];

  const viewportRaw = localStorage.getItem(`timeline-viewport-${activeId}`);
  const viewport = viewportRaw ? JSON.parse(viewportRaw) : null;

  const savedPosRaw = localStorage.getItem(`timeline-savedpos-${activeId}`);
  const savedPosition = savedPosRaw ? JSON.parse(savedPosRaw) : null;

  const data = {
    version: 1,
    timeline: { name, events, viewport, savedPosition },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(name)}.timeline.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse and validate a .timeline.json File. Returns { name, events, viewport } or throws. */
export async function parseTimelineFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  if (!data || typeof data !== 'object' || !data.timeline) {
    throw new Error('Not a valid timeline file.');
  }

  const { timeline } = data;

  if (!timeline.name || typeof timeline.name !== 'string') {
    throw new Error('Timeline file is missing a name.');
  }

  if (!Array.isArray(timeline.events)) {
    throw new Error('Timeline file is missing events array.');
  }

  // Validate & sanitize events
  const events = timeline.events.map((ev, i) => {
    for (const field of REQUIRED_EVENT_FIELDS) {
      if (!ev[field]) throw new Error(`Event ${i + 1} is missing required field "${field}".`);
    }
    const clean = { id: crypto.randomUUID() };
    for (const field of ALLOWED_EVENT_FIELDS) {
      if (ev[field] !== undefined) clean[field] = ev[field];
    }
    return clean;
  });

  // Viewport is optional
  let viewport = null;
  if (timeline.viewport && typeof timeline.viewport === 'object') {
    const { viewStart, viewEnd, tlHeight } = timeline.viewport;
    if (Number.isFinite(viewStart) && Number.isFinite(viewEnd) && viewEnd > viewStart) {
      viewport = { viewStart, viewEnd };
      if (Number.isFinite(tlHeight)) viewport.tlHeight = tlHeight;
    }
  }

  // Saved position is optional
  let savedPosition = null;
  if (timeline.savedPosition && typeof timeline.savedPosition === 'object') {
    const { viewStart, viewEnd } = timeline.savedPosition;
    if (Number.isFinite(viewStart) && Number.isFinite(viewEnd) && viewEnd > viewStart) {
      savedPosition = { viewStart, viewEnd };
    }
  }

  return { name: timeline.name.trim(), events, viewport, savedPosition };
}
