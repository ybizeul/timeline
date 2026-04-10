package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"timeline/server/internal/config"
	"timeline/server/internal/httpapi"
	"timeline/server/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx := context.Background()
	mongoConn, err := store.ConnectMongo(ctx, cfg.MongoURI, cfg.MongoDatabase)
	if err != nil {
		log.Fatalf("mongo error: %v", err)
	}
	indexCtx, indexCancel := context.WithTimeout(ctx, 10*time.Second)
	if err := mongoConn.EnsureIdentityIndexes(indexCtx); err != nil {
		indexCancel()
		log.Fatalf("mongo index error: %v", err)
	}
	if err := mongoConn.EnsureContentIndexes(indexCtx); err != nil {
		indexCancel()
		log.Fatalf("mongo content index error: %v", err)
	}
	indexCancel()
	defer func() {
		disconnectCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = mongoConn.Client.Disconnect(disconnectCtx)
	}()

	router, err := httpapi.NewRouter(httpapi.Dependencies{
		Config: cfg,
		Mongo:  mongoConn,
	})
	if err != nil {
		log.Fatalf("router error: %v", err)
	}

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}

	go func() {
		log.Printf("timeline-server listening on %s", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown error: %v", err)
	}
}
