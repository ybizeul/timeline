package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"timeline/server/internal/auth"
	"timeline/server/internal/store"
)

func registerPrivateRoutes(mux *http.ServeMux, mongoStore *store.Mongo, authManager *auth.Manager) {
	mux.Handle("GET /api/private/timelines", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		items, err := mongoStore.ListTimelines(r.Context(), ownerID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "list timelines failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"timelines": stringifyTimelineIDs(items)})
	})))

	mux.Handle("POST /api/private/timelines", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		created, err := mongoStore.CreateTimeline(r.Context(), ownerID, strings.TrimSpace(body.Name))
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "create timeline failed"})
			return
		}
		respondJSON(w, http.StatusCreated, stringifyTimeline(*created))
	})))

	mux.Handle("PATCH /api/private/timelines/{timelineId}", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		timelineID, err := objectIDFromPath(r, "timelineId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid timeline id"})
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		if err := mongoStore.RenameTimeline(r.Context(), ownerID, timelineID, strings.TrimSpace(body.Name)); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				respondJSON(w, http.StatusNotFound, map[string]string{"error": "timeline not found"})
				return
			}
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "rename timeline failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("DELETE /api/private/timelines/{timelineId}", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		timelineID, err := objectIDFromPath(r, "timelineId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid timeline id"})
			return
		}
		if err := mongoStore.DeleteTimeline(r.Context(), ownerID, timelineID); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				respondJSON(w, http.StatusNotFound, map[string]string{"error": "timeline not found"})
				return
			}
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete timeline failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("GET /api/private/timelines/{timelineId}/events", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		timelineID, err := objectIDFromPath(r, "timelineId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid timeline id"})
			return
		}
		events, err := mongoStore.GetTimelineEvents(r.Context(), ownerID, timelineID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "get timeline events failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"events": events})
	})))

	mux.Handle("PUT /api/private/timelines/{timelineId}/events", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		timelineID, err := objectIDFromPath(r, "timelineId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid timeline id"})
			return
		}
		var body struct {
			Events []map[string]any `json:"events"`
		}
		if err := decodeJSON(r, &body); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
			return
		}
		if body.Events == nil {
			body.Events = []map[string]any{}
		}
		if err := mongoStore.PutTimelineEvents(r.Context(), ownerID, timelineID, body.Events); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "put timeline events failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("GET /api/private/timelines/{timelineId}/state", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		timelineID, err := objectIDFromPath(r, "timelineId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid timeline id"})
			return
		}
		state, err := mongoStore.GetTimelineState(r.Context(), ownerID, timelineID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "get timeline state failed"})
			return
		}
		respondJSON(w, http.StatusOK, state)
	})))

	mux.Handle("PUT /api/private/timelines/{timelineId}/state", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		timelineID, err := objectIDFromPath(r, "timelineId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid timeline id"})
			return
		}
		var state map[string]any
		if err := decodeJSON(r, &state); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
			return
		}
		if err := mongoStore.PutTimelineState(r.Context(), ownerID, timelineID, state); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "put timeline state failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("GET /api/private/orgcharts", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		items, err := mongoStore.ListOrgCharts(r.Context(), ownerID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "list org charts failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"charts": stringifyOrgChartIDs(items)})
	})))

	mux.Handle("POST /api/private/orgcharts", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		created, err := mongoStore.CreateOrgChart(r.Context(), ownerID, strings.TrimSpace(body.Name))
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "create org chart failed"})
			return
		}
		respondJSON(w, http.StatusCreated, stringifyOrgChart(*created))
	})))

	mux.Handle("PATCH /api/private/orgcharts/{chartId}", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		if err := mongoStore.RenameOrgChart(r.Context(), ownerID, chartID, strings.TrimSpace(body.Name)); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				respondJSON(w, http.StatusNotFound, map[string]string{"error": "org chart not found"})
				return
			}
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "rename org chart failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("DELETE /api/private/orgcharts/{chartId}", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		if err := mongoStore.DeleteOrgChart(r.Context(), ownerID, chartID); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				respondJSON(w, http.StatusNotFound, map[string]string{"error": "org chart not found"})
				return
			}
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete org chart failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("GET /api/private/orgcharts/{chartId}/people", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		people, err := mongoStore.GetOrgPeople(r.Context(), ownerID, chartID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "get people failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"people": people})
	})))

	mux.Handle("PUT /api/private/orgcharts/{chartId}/people", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		var body struct {
			People []map[string]any `json:"people"`
		}
		if err := decodeJSON(r, &body); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
			return
		}
		if body.People == nil {
			body.People = []map[string]any{}
		}
		if err := mongoStore.PutOrgPeople(r.Context(), ownerID, chartID, body.People); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "put people failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("GET /api/private/orgcharts/{chartId}/groups", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		groups, err := mongoStore.GetOrgGroups(r.Context(), ownerID, chartID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "get groups failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"groups": groups})
	})))

	mux.Handle("PUT /api/private/orgcharts/{chartId}/groups", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		var body struct {
			Groups []map[string]any `json:"groups"`
		}
		if err := decodeJSON(r, &body); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
			return
		}
		if body.Groups == nil {
			body.Groups = []map[string]any{}
		}
		if err := mongoStore.PutOrgGroups(r.Context(), ownerID, chartID, body.Groups); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "put groups failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))

	mux.Handle("GET /api/private/orgcharts/{chartId}/state", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		state, err := mongoStore.GetOrgState(r.Context(), ownerID, chartID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "get org state failed"})
			return
		}
		respondJSON(w, http.StatusOK, state)
	})))

	mux.Handle("PUT /api/private/orgcharts/{chartId}/state", authManager.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ownerID, ok := ownerObjectID(r)
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid owner session"})
			return
		}
		chartID, err := objectIDFromPath(r, "chartId")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid chart id"})
			return
		}
		var state map[string]any
		if err := decodeJSON(r, &state); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
			return
		}
		if err := mongoStore.PutOrgState(r.Context(), ownerID, chartID, state); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "put org state failed"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"ok": true})
	})))
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func ownerObjectID(r *http.Request) (primitive.ObjectID, bool) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user.LocalUserID == "" {
		return primitive.NilObjectID, false
	}
	oid, err := primitive.ObjectIDFromHex(user.LocalUserID)
	if err != nil {
		return primitive.NilObjectID, false
	}
	return oid, true
}

func objectIDFromPath(r *http.Request, param string) (primitive.ObjectID, error) {
	return primitive.ObjectIDFromHex(r.PathValue(param))
}

func stringifyTimelineIDs(items []store.Timeline) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, stringifyTimeline(it))
	}
	return out
}

func stringifyTimeline(item store.Timeline) map[string]any {
	return map[string]any{
		"id":        item.ID.Hex(),
		"name":      item.Name,
		"createdAt": item.CreatedAt,
		"updatedAt": item.UpdatedAt,
	}
}

func stringifyOrgChartIDs(items []store.OrgChart) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, stringifyOrgChart(it))
	}
	return out
}

func stringifyOrgChart(item store.OrgChart) map[string]any {
	return map[string]any{
		"id":        item.ID.Hex(),
		"name":      item.Name,
		"createdAt": item.CreatedAt,
		"updatedAt": item.UpdatedAt,
	}
}
