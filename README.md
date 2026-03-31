# Timeline

A local, browser-based timeline app inspired by [time.graphics](https://time.graphics). Create and manage multiple timelines with richly styled events — all stored in your browser with no backend required.

![Screenshot](screenshot.png)

You can test it on [https://timeline.tynsoe.org](https://timeline.tynsoe.org).

## Features

- **Multiple timelines** — create, rename, and delete independent timelines from the toolbar
- **Import / export** — export a timeline as a `.timeline.json` file (events + viewport); import it back to restore or share
- **Point & ranged events** — events with only a start date appear as labelled markers; events with a start and end date span a time range
- **Range brackets** — small chevron marks at the start and end of ranged events to clarify the span
- **Three display styles per event**
  - *Solid* — filled colour rectangle with white text
  - *Outline* — border-only frame with coloured text
  - *Label* — text only with an underline bar for ranged events
- **Alignment** — each event can be anchored left, center, or right relative to its date; callout pointers always align with the precise timestamp
- **Notes** — optional multi-line description that can be shown directly on the timeline, respecting the event's text alignment
- **Lane stacking** — overlapping events are automatically assigned to separate vertical lanes; connectors from higher lanes pass behind lower-lane events
- **Today marker** — a red dashed vertical line marks the current date; togglable from the toolbar
- **Weekend highlights** — subtle background shading for weekends at day/week/month scales; togglable from the toolbar
- **Smooth navigation** — pan by dragging, zoom with the scroll wheel, or use the toolbar buttons
- **Resizable timeline area** — drag the divider below the timeline to adjust its height; height is stored per-timeline
- **Persistent storage** — all data (events, viewport position, active timeline, panel height) is saved to `localStorage` per-timeline; nothing leaves your browser
- **Keyboard shortcuts** — `Escape` to close the editor, `Cmd/Ctrl + Enter` to save

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Docker

```bash
docker build -t timeline .
docker run -p 8080:80 timeline
```

Then open [http://localhost:8080](http://localhost:8080).

## Usage

| Action | How |
|---|---|
| Add an event | Click **+ Add event** in the toolbar |
| Edit / delete an event | Click any event on the timeline |
| Pan | Click and drag the timeline |
| Zoom | Scroll wheel over the timeline |
| Switch / manage timelines | Click the timeline name in the top-left |
| Export timeline | Timeline menu → **Export** |
| Import timeline | Timeline menu → **Import** |
| Toggle today marker | Click **⊕ marker** / **⊘ marker** in the toolbar |
| Toggle weekend highlights | Click **⊕ weekends** / **⊘ weekends** in the toolbar |

## Tech Stack

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/)
- SVG rendering — no canvas, no third-party charting library
- [date-fns](https://date-fns.org/) for date formatting and tick generation
- `localStorage` for persistence

## Project Structure

```
src/
  App.jsx                     # Root layout, state wiring
  components/
    Controls/                 # Toolbar (zoom, pan, today, timeline switcher)
    EventEditor/              # Slide-in panel for creating/editing events
    EventModal/               # Event detail modal
    Timeline/
      Timeline.jsx            # SVG container, drag/zoom handlers
      TimeAxis.jsx            # Tick generation and axis rendering
      EventLayer.jsx          # Lays out and renders all events
      EventItem.jsx           # Per-event rendering (solid / outline / label)
      TodayLine.jsx           # Red "today" marker
  hooks/
    useViewport.js            # Pan & zoom state (per-timeline persistence)
    useEvents.js              # CRUD + localStorage for events
    useTimelines.js           # CRUD + localStorage for timelines, import
  utils/
    eventLayout.js            # Lane assignment algorithm
    timeScale.js              # Tick scale levels, tToX / xToT helpers
    colors.js                 # Preset event colours
    io.js                     # Timeline export/import (JSON)
    locale.js                 # Date formatting helpers
```

## Building for Production

```bash
npm run build
```

Output is written to `dist/` and can be served from any static host.
