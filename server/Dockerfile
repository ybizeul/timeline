# syntax=docker/dockerfile:1

FROM node:22-alpine AS web-build
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN VITE_RUNTIME_MODE=server VITE_API_BASE= npm run build

FROM golang:1.23-alpine AS go-build
WORKDIR /src
RUN apk add --no-cache ca-certificates tzdata
COPY server/go.mod ./
RUN go mod download
COPY server/ ./
COPY --from=web-build /app/dist ./web/dist
RUN go build -o /out/timeline-server ./cmd/timeline-server

FROM alpine:3.20
RUN adduser -D -u 10001 appuser
WORKDIR /app
COPY --from=go-build /out/timeline-server /app/timeline-server
USER appuser
EXPOSE 8080
ENTRYPOINT ["/app/timeline-server"]
