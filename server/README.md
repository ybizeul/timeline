# timeline-server

Go server runtime for Timeline with embedded Vite frontend and MongoDB.

## Current status

This is the initial scaffold. Included:
- embedded frontend static serving from server/web/dist
- health endpoint at /api/healthz
- provider configuration endpoint at /api/auth/providers
- placeholders for OAuth and share routes

Not yet included:
- full OAuth login/callback/session flows
- CRUD endpoints for timelines/org charts
- share token generation and anonymous read-only access

## Run locally

1. Build frontend assets at repo root:

   npm run build

2. From server directory:

   go mod tidy
   SESSION_SECRET=dev-secret \
   MONGO_URI=mongodb://localhost:27017 \
   MONGO_DATABASE=timeline \
   go run ./cmd/timeline-server

3. Open http://localhost:8080
