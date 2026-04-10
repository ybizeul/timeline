package httpapi

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"timeline/server/internal/auth"
	"timeline/server/internal/config"
	"timeline/server/internal/store"
	"timeline/server/web"
)

type Dependencies struct {
	Config config.Config
	Mongo  *store.Mongo
}

func NewRouter(deps Dependencies) (http.Handler, error) {
	authManager, err := auth.NewManager(deps.Config, deps.Mongo)
	if err != nil {
		return nil, err
	}

	distFS, err := web.DistFS()
	if err != nil {
		return nil, err
	}
	staticHandler := http.FileServer(http.FS(distFS))

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/healthz", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]any{
			"status":   "ok",
			"mongo":    deps.Mongo != nil,
			"time":     time.Now().UTC().Format(time.RFC3339),
			"revision": "dev",
		})
	})

	mux.HandleFunc("GET /api/auth/providers", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]any{
			"providers": authManager.ProviderStatuses(),
		})
	})

	mux.HandleFunc("GET /api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		user, err := authManager.CurrentUser(r)
		if err != nil {
			respondJSON(w, http.StatusUnauthorized, map[string]any{"authenticated": false})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"authenticated": true, "user": user})
	})

	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if err := authManager.Logout(w, r); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "logout failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	mux.HandleFunc("GET /api/auth/{provider}/start", func(w http.ResponseWriter, r *http.Request) {
		provider := r.PathValue("provider")
		err := authManager.BeginAuth(w, r, provider)
		if err == nil {
			return
		}
		if err == auth.ErrProviderDisabled {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "provider is not enabled"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	})

	mux.HandleFunc("GET /api/auth/{provider}/callback", func(w http.ResponseWriter, r *http.Request) {
		provider := r.PathValue("provider")
		_, err := authManager.CompleteAuth(w, r, provider)
		if err != nil {
			auth.RedirectWithError(w, r, err.Error())
			return
		}
		http.Redirect(w, r, "/", http.StatusFound)
	})

	mux.Handle("GET /api/private/whoami", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, _ := auth.UserFromContext(r.Context())
		respondJSON(w, http.StatusOK, map[string]any{
			"owner": user,
		})
	})))

	registerPrivateRoutes(mux, deps.Mongo, authManager)
	registerShareRoutes(mux, deps.Mongo)

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "unknown API route"})
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "unknown API route"})
			return
		}

		if r.URL.Path == "/" {
			http.ServeFileFS(w, r, distFS, "index.html")
			return
		}

		cleanPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if cleanPath != "" {
			if _, statErr := fs.Stat(distFS, cleanPath); statErr == nil {
				staticHandler.ServeHTTP(w, r)
				return
			}
		}

		// SPA fallback for client-side routes.
		http.ServeFileFS(w, r, distFS, "index.html")
	})

	return mux, nil
}

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
