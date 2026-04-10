package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"timeline/server/internal/store"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type shareTarget struct {
	Kind string
	ID   primitive.ObjectID
}

func parseShareID(raw string) (shareTarget, error) {
	if strings.HasPrefix(raw, "t_") {
		oid, err := primitive.ObjectIDFromHex(strings.TrimPrefix(raw, "t_"))
		if err != nil {
			return shareTarget{}, err
		}
		return shareTarget{Kind: "timeline", ID: oid}, nil
	}
	if strings.HasPrefix(raw, "o_") {
		oid, err := primitive.ObjectIDFromHex(strings.TrimPrefix(raw, "o_"))
		if err != nil {
			return shareTarget{}, err
		}
		return shareTarget{Kind: "orgchart", ID: oid}, nil
	}
	return shareTarget{}, errors.New("invalid share id")
}

func registerShareRoutes(mux *http.ServeMux, mongoStore *store.Mongo) {
	mux.HandleFunc("GET /api/share/{shareId}", func(w http.ResponseWriter, r *http.Request) {
		target, err := parseShareID(r.PathValue("shareId"))
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid share id"})
			return
		}

		switch target.Kind {
		case "timeline":
			tl, err := mongoStore.GetTimelineByID(r.Context(), target.ID)
			if err != nil {
				if errors.Is(err, mongo.ErrNoDocuments) {
					respondJSON(w, http.StatusNotFound, map[string]string{"error": "timeline not found"})
					return
				}
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load timeline"})
				return
			}
			respondJSON(w, http.StatusOK, map[string]any{"type": "timeline", "id": tl.ID.Hex(), "name": tl.Name})
		case "orgchart":
			chart, err := mongoStore.GetOrgChartByID(r.Context(), target.ID)
			if err != nil {
				if errors.Is(err, mongo.ErrNoDocuments) {
					respondJSON(w, http.StatusNotFound, map[string]string{"error": "org chart not found"})
					return
				}
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load org chart"})
				return
			}
			respondJSON(w, http.StatusOK, map[string]any{"type": "orgchart", "id": chart.ID.Hex(), "name": chart.Name})
		}
	})

	mux.HandleFunc("GET /api/share/{shareId}/events", func(w http.ResponseWriter, r *http.Request) {
		target, err := parseShareID(r.PathValue("shareId"))
		if err != nil || target.Kind != "timeline" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid timeline share id"})
			return
		}
		events, err := mongoStore.GetTimelineEventsPublic(r.Context(), target.ID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load timeline events"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"events": events})
	})

	mux.HandleFunc("GET /api/share/{shareId}/state", func(w http.ResponseWriter, r *http.Request) {
		target, err := parseShareID(r.PathValue("shareId"))
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid share id"})
			return
		}

		switch target.Kind {
		case "timeline":
			state, err := mongoStore.GetTimelineStatePublic(r.Context(), target.ID)
			if err != nil {
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load timeline state"})
				return
			}
			respondJSON(w, http.StatusOK, state)
		case "orgchart":
			state, err := mongoStore.GetOrgStatePublic(r.Context(), target.ID)
			if err != nil {
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load org chart state"})
				return
			}
			respondJSON(w, http.StatusOK, state)
		}
	})

	mux.HandleFunc("GET /api/share/{shareId}/people", func(w http.ResponseWriter, r *http.Request) {
		target, err := parseShareID(r.PathValue("shareId"))
		if err != nil || target.Kind != "orgchart" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid org chart share id"})
			return
		}
		people, err := mongoStore.GetOrgPeoplePublic(r.Context(), target.ID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load people"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"people": people})
	})

	mux.HandleFunc("GET /api/share/{shareId}/groups", func(w http.ResponseWriter, r *http.Request) {
		target, err := parseShareID(r.PathValue("shareId"))
		if err != nil || target.Kind != "orgchart" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid org chart share id"})
			return
		}
		groups, err := mongoStore.GetOrgGroupsPublic(r.Context(), target.ID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load groups"})
			return
		}
		respondJSON(w, http.StatusOK, map[string]any{"groups": groups})
	})
}
