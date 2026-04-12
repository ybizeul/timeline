*Disclaimer : This project is entirely vibe coded using Claude and Codex*

# Timeline

A web app for **timelines** and **org charts** — inspired by [time.graphics](https://time.graphics).

It supports two runtimes:

- **Browser-only mode** (default): local-first usage with data persisted in your browser
- **Server mode** (Go + MongoDB): API-backed runtime with auth/share endpoints and embedded frontend assets

![Screenshot](screenshot.png)

You can test the browser storage options on [https://timeline.tynsoe.org](https://timeline.tynsoe.org).

## Features

### Timeline

- **Multiple timelines** — create, rename, and delete independent timelines from the toolbar
- **Import / export** — export a timeline as a `.timeline.json` file (events + viewport); import it back to restore or share
- **SVG export** — export the current view as an SVG file
- **Point & ranged events** — events with only a start date appear as labelled markers; events with a start and end date span a time range
- **Range brackets** — small chevron marks at the start and end of ranged events to clarify the span
- **Three display styles per event**
  - *Solid* — filled colour rectangle with white text
  - *Outline* — border-only frame with coloured text
  - *Label* — text only with an underline bar for ranged events
- **Alignment** — each event can be anchored left, center, or right relative to its date; callout pointers always align with the precise timestamp
- **Notes** — optional multi-line description that can be shown directly on the timeline, respecting the event's text alignment
- **Lane stacking** — overlapping events are automatically assigned to separate vertical lanes; same-colour events are grouped on the same lane when possible
- **Today marker** — a red dashed vertical line marks the current date; togglable from the toolbar
- **Weekend highlights** — subtle background shading for weekends at day/week/month scales; togglable from the toolbar
- **Save / Restore view** — bookmark and recall a viewport position per timeline
- **Smooth navigation** — pan by dragging, zoom with the scroll wheel, or use the toolbar buttons
- **Resizable timeline area** — drag the divider below the timeline to adjust its height; height is stored per-timeline

### Org Chart

- **Multiple org charts** — create, rename, and delete independent org charts
- **Import / export** — export as `.orgchart.json`; import to restore or share
- **SVG / PNG export** — export the current chart as SVG or PNG
- **Person cards** — each person has a first name, last name, role, company, organisation, and colour
- **Photo support** — upload and display a photo on each person card
- **Reporting hierarchy** — solid lines for direct reports, dashed lines for dotted reporting relationships
- **Collapse / expand** — hide or reveal a person's subordinates
- **Visual groups** — frame selected people together with an editable label
- **Focus mode** — highlight a single person and their reporting lineage
- **Card controls toggle** — show or hide edit/delete/collapse buttons on cards
- **Smooth navigation** — pan by dragging, zoom with the scroll wheel, or fit the chart to screen

### General

- **Sidebar navigation** — switch between Timeline and Org Chart modes
- **Persistent storage**
  - Browser-only mode: all data (events, people, groups, viewport positions, bookmarks) is saved to `localStorage`
  - Server mode: data is stored in MongoDB through the Go API
- **Keyboard shortcuts** — `Escape` to close the editor, `Cmd/Ctrl + Enter` to save
- **Mobile-friendly** — responsive toolbar with overflow menu

## Getting Started

### Prerequisites

- Node.js 18+
- For server mode: Go 1.23+ and Docker (for local MongoDB)

### Browser-Only Mode (Frontend)

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Browser-Only Docker Image

```bash
docker build -t timeline .
docker run -p 8080:80 timeline
```

Then open [http://localhost:8080](http://localhost:8080).

### Server Mode (Go + MongoDB)

This repository now includes an additive server runtime in [server/README.md](server/README.md).

- Existing browser-only image remains available.
- Server image name/build target: `timeline-server`.
- The Go binary serves API routes and embedded Vite assets.

Start local MongoDB:

```bash
docker compose -f compose.yaml up -d mongodb
```

Build embedded frontend assets for the server:

```bash
VITE_RUNTIME_MODE=server VITE_API_BASE= npm run build
rm -rf server/web/dist
mkdir -p server/web
cp -R dist server/web/
```

Run server locally:

```bash
cd server
SESSION_SECRET=dev-secret \
MONGO_URI=mongodb://localhost:27017 \
MONGO_DATABASE=timeline \
go run ./cmd/timeline-server
```

Then open [http://localhost:8080](http://localhost:8080).

Frontend-only hot-reload against the Go API (optional):

```bash
VITE_RUNTIME_MODE=server VITE_API_BASE= GO_API_TARGET=http://127.0.0.1:8080 npm run dev
```

Build server binary:

```bash
npm run server:build
```

Build server container:

```bash
npm run docker:build:server
```

Sample deployment files:

- Docker Compose: [deploy/docker-compose.server.sample.yml](deploy/docker-compose.server.sample.yml)
- Kubernetes: [deploy/k8s](deploy/k8s)

## Usage

### Timeline

| Action | How |
|---|---|
| Add an event | Click **Add event** in the toolbar |
| Edit / delete an event | Click any event on the timeline |
| Pan | Click and drag the timeline |
| Zoom | Scroll wheel over the timeline |
| Switch / manage timelines | Click the timeline name in the top-left |
| Export timeline | Timeline menu → **Export** |
| Import timeline | Timeline menu → **Import** |
| Export as SVG | Click **SVG** in the toolbar |
| Save / restore view | Click **Save View** / **Restore View** in the toolbar |
| Toggle today marker | Click the today-marker toggle in the toolbar |
| Toggle weekend highlights | Click the weekends toggle in the toolbar |

### Org Chart

| Action | How |
|---|---|
| Add a person | Click **Add person** in the toolbar |
| Edit / delete a person | Click any person card |
| Pan | Click and drag the canvas |
| Zoom | Scroll wheel over the canvas |
| Fit to screen | Click **Fit** in the toolbar |
| Switch / manage org charts | Click the chart name in the top-left |
| Collapse / expand subordinates | Click the collapse control on a person card |
| Focus on a person | Select a person to highlight their lineage |
| Export as SVG / PNG | Org chart menu → **Export SVG** / **Export PNG** |
| Import org chart | Org chart menu → **Import** |

## Tech Stack

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/)
- SVG rendering — no canvas, no third-party charting library
- [date-fns](https://date-fns.org/) for date formatting and tick generation
- `localStorage` for persistence

## Project Structure

```
src/
  App.jsx                     # Root layout, mode switching, state wiring
  components/
    Sidebar/                  # Mode switcher (Timeline / Org Chart)
    Controls/                 # Toolbar for both modes
    EventEditor/              # Slide-in panel for creating/editing events
    EventModal/               # Event detail modal
    Timeline/
      Timeline.jsx            # SVG container, drag/zoom handlers
      TimeAxis.jsx            # Tick generation and axis rendering
      EventLayer.jsx          # Lays out and renders all events
      EventItem.jsx           # Per-event rendering (solid / outline / label)
      TodayLine.jsx           # Red "today" marker
    OrgChart/
      OrgChart.jsx            # SVG canvas, drag/zoom, card rendering
      PersonCard.jsx          # Individual person card with photo & colour
      OrgConnectors.jsx       # Parent-child connectors (solid & dashed)
      GroupOverlays.jsx       # Named group frames around people
    PersonEditor/             # Slide-in panel for creating/editing people
  hooks/
    useTimelines.js           # CRUD + localStorage for timelines
    useEvents.js              # CRUD + localStorage for events
    useViewport.js            # Pan & zoom state (per-timeline)
    useOrgCharts.js           # CRUD + localStorage for org charts
    usePeople.js              # CRUD + localStorage for people
    useGroups.js              # CRUD + localStorage for groups
    useOrgViewport.js         # Pan & zoom state (per-org chart)
  utils/
    eventLayout.js            # Lane assignment algorithm
    eventGeometry.js          # Event dimension calculations
    timeScale.js              # Tick scale levels, tToX / xToT helpers
    orgLayout.js              # Hierarchical tree layout algorithm
    exportSvg.js              # Timeline SVG export
    exportOrgChartSvg.js      # Org chart SVG / PNG export
    io.js                     # Timeline import/export (JSON)
    orgChartIo.js             # Org chart import/export (JSON)
    imageResize.js            # Photo resizing for person cards
    colors.js                 # Preset colour palette
    locale.js                 # Date formatting helpers
```

## Building for Production

```bash
npm run build
```

Output is written to `dist/` and can be served from any static host.

For server mode deployments, copy `dist/` into `server/web/dist/` before building/running the Go server so assets are embedded.
