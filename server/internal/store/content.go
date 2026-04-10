package store

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Timeline struct {
	ID        primitive.ObjectID `bson:"_id" json:"id"`
	OwnerID   primitive.ObjectID `bson:"ownerId" json:"-"`
	Name      string             `bson:"name" json:"name"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type OrgChart struct {
	ID        primitive.ObjectID `bson:"_id" json:"id"`
	OwnerID   primitive.ObjectID `bson:"ownerId" json:"-"`
	Name      string             `bson:"name" json:"name"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

func (m *Mongo) EnsureContentIndexes(ctx context.Context) error {
	models := []struct {
		collection string
		keys       bson.D
		name       string
		unique     bool
	}{
		{collection: "timelines", keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "updatedAt", Value: -1}}, name: "timelines_owner_updated", unique: false},
		{collection: "org_charts", keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "updatedAt", Value: -1}}, name: "orgcharts_owner_updated", unique: false},
		{collection: "timeline_events", keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "timelineId", Value: 1}}, name: "timeline_events_owner_timeline", unique: true},
		{collection: "timeline_states", keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "timelineId", Value: 1}}, name: "timeline_states_owner_timeline", unique: true},
		{collection: "org_people", keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "chartId", Value: 1}}, name: "org_people_owner_chart", unique: true},
		{collection: "org_groups", keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "chartId", Value: 1}}, name: "org_groups_owner_chart", unique: true},
		{collection: "org_states", keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "chartId", Value: 1}}, name: "org_states_owner_chart", unique: true},
	}

	for _, model := range models {
		_, err := m.Database.Collection(model.collection).Indexes().CreateOne(ctx, mongo.IndexModel{
			Keys:    model.keys,
			Options: options.Index().SetName(model.name).SetUnique(model.unique),
		})
		if err != nil {
			return fmt.Errorf("create index %s: %w", model.name, err)
		}
	}

	return nil
}

func (m *Mongo) ListTimelines(ctx context.Context, ownerID primitive.ObjectID) ([]Timeline, error) {
	cur, err := m.Database.Collection("timelines").Find(ctx, bson.M{"ownerId": ownerID}, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	items := []Timeline{}
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (m *Mongo) CreateTimeline(ctx context.Context, ownerID primitive.ObjectID, name string) (*Timeline, error) {
	now := time.Now().UTC()
	t := &Timeline{ID: primitive.NewObjectID(), OwnerID: ownerID, Name: name, CreatedAt: now, UpdatedAt: now}
	if _, err := m.Database.Collection("timelines").InsertOne(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

func (m *Mongo) RenameTimeline(ctx context.Context, ownerID, timelineID primitive.ObjectID, name string) error {
	res, err := m.Database.Collection("timelines").UpdateOne(ctx,
		bson.M{"_id": timelineID, "ownerId": ownerID},
		bson.M{"$set": bson.M{"name": name, "updatedAt": time.Now().UTC()}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

func (m *Mongo) DeleteTimeline(ctx context.Context, ownerID, timelineID primitive.ObjectID) error {
	if _, err := m.Database.Collection("timeline_events").DeleteOne(ctx, bson.M{"ownerId": ownerID, "timelineId": timelineID}); err != nil {
		return err
	}
	if _, err := m.Database.Collection("timeline_states").DeleteOne(ctx, bson.M{"ownerId": ownerID, "timelineId": timelineID}); err != nil {
		return err
	}
	res, err := m.Database.Collection("timelines").DeleteOne(ctx, bson.M{"_id": timelineID, "ownerId": ownerID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

func (m *Mongo) GetTimelineEvents(ctx context.Context, ownerID, timelineID primitive.ObjectID) ([]map[string]any, error) {
	var doc struct {
		Events []map[string]any `bson:"events"`
	}
	err := m.Database.Collection("timeline_events").FindOne(ctx, bson.M{"ownerId": ownerID, "timelineId": timelineID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if doc.Events == nil {
		return []map[string]any{}, nil
	}
	return doc.Events, nil
}

func (m *Mongo) PutTimelineEvents(ctx context.Context, ownerID, timelineID primitive.ObjectID, events []map[string]any) error {
	_, err := m.Database.Collection("timeline_events").UpdateOne(ctx,
		bson.M{"ownerId": ownerID, "timelineId": timelineID},
		bson.M{"$set": bson.M{"events": events, "updatedAt": time.Now().UTC()}, "$setOnInsert": bson.M{"createdAt": time.Now().UTC()}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (m *Mongo) GetTimelineState(ctx context.Context, ownerID, timelineID primitive.ObjectID) (map[string]any, error) {
	var doc struct {
		Viewport      map[string]any `bson:"viewport"`
		SavedPosition map[string]any `bson:"savedPosition"`
	}
	err := m.Database.Collection("timeline_states").FindOne(ctx, bson.M{"ownerId": ownerID, "timelineId": timelineID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return map[string]any{"viewport": map[string]any{}, "savedPosition": map[string]any{}}, nil
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"viewport": doc.Viewport, "savedPosition": doc.SavedPosition}, nil
}

func (m *Mongo) PutTimelineState(ctx context.Context, ownerID, timelineID primitive.ObjectID, state map[string]any) error {
	viewport, _ := state["viewport"].(map[string]any)
	savedPosition, _ := state["savedPosition"].(map[string]any)
	_, err := m.Database.Collection("timeline_states").UpdateOne(ctx,
		bson.M{"ownerId": ownerID, "timelineId": timelineID},
		bson.M{"$set": bson.M{"viewport": viewport, "savedPosition": savedPosition, "updatedAt": time.Now().UTC()}, "$setOnInsert": bson.M{"createdAt": time.Now().UTC()}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (m *Mongo) ListOrgCharts(ctx context.Context, ownerID primitive.ObjectID) ([]OrgChart, error) {
	cur, err := m.Database.Collection("org_charts").Find(ctx, bson.M{"ownerId": ownerID}, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	items := []OrgChart{}
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (m *Mongo) CreateOrgChart(ctx context.Context, ownerID primitive.ObjectID, name string) (*OrgChart, error) {
	now := time.Now().UTC()
	c := &OrgChart{ID: primitive.NewObjectID(), OwnerID: ownerID, Name: name, CreatedAt: now, UpdatedAt: now}
	if _, err := m.Database.Collection("org_charts").InsertOne(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (m *Mongo) RenameOrgChart(ctx context.Context, ownerID, chartID primitive.ObjectID, name string) error {
	res, err := m.Database.Collection("org_charts").UpdateOne(ctx,
		bson.M{"_id": chartID, "ownerId": ownerID},
		bson.M{"$set": bson.M{"name": name, "updatedAt": time.Now().UTC()}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

func (m *Mongo) DeleteOrgChart(ctx context.Context, ownerID, chartID primitive.ObjectID) error {
	if _, err := m.Database.Collection("org_people").DeleteOne(ctx, bson.M{"ownerId": ownerID, "chartId": chartID}); err != nil {
		return err
	}
	if _, err := m.Database.Collection("org_groups").DeleteOne(ctx, bson.M{"ownerId": ownerID, "chartId": chartID}); err != nil {
		return err
	}
	if _, err := m.Database.Collection("org_states").DeleteOne(ctx, bson.M{"ownerId": ownerID, "chartId": chartID}); err != nil {
		return err
	}
	res, err := m.Database.Collection("org_charts").DeleteOne(ctx, bson.M{"_id": chartID, "ownerId": ownerID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

func (m *Mongo) GetOrgPeople(ctx context.Context, ownerID, chartID primitive.ObjectID) ([]map[string]any, error) {
	var doc struct {
		People []map[string]any `bson:"people"`
	}
	err := m.Database.Collection("org_people").FindOne(ctx, bson.M{"ownerId": ownerID, "chartId": chartID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if doc.People == nil {
		return []map[string]any{}, nil
	}
	return doc.People, nil
}

func (m *Mongo) PutOrgPeople(ctx context.Context, ownerID, chartID primitive.ObjectID, people []map[string]any) error {
	_, err := m.Database.Collection("org_people").UpdateOne(ctx,
		bson.M{"ownerId": ownerID, "chartId": chartID},
		bson.M{"$set": bson.M{"people": people, "updatedAt": time.Now().UTC()}, "$setOnInsert": bson.M{"createdAt": time.Now().UTC()}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (m *Mongo) GetOrgGroups(ctx context.Context, ownerID, chartID primitive.ObjectID) ([]map[string]any, error) {
	var doc struct {
		Groups []map[string]any `bson:"groups"`
	}
	err := m.Database.Collection("org_groups").FindOne(ctx, bson.M{"ownerId": ownerID, "chartId": chartID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if doc.Groups == nil {
		return []map[string]any{}, nil
	}
	return doc.Groups, nil
}

func (m *Mongo) PutOrgGroups(ctx context.Context, ownerID, chartID primitive.ObjectID, groups []map[string]any) error {
	_, err := m.Database.Collection("org_groups").UpdateOne(ctx,
		bson.M{"ownerId": ownerID, "chartId": chartID},
		bson.M{"$set": bson.M{"groups": groups, "updatedAt": time.Now().UTC()}, "$setOnInsert": bson.M{"createdAt": time.Now().UTC()}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (m *Mongo) GetOrgState(ctx context.Context, ownerID, chartID primitive.ObjectID) (map[string]any, error) {
	var doc struct {
		Viewport         map[string]any `bson:"viewport"`
		CollapsedIDs     []string       `bson:"collapsedIds"`
		ShowCardControls *bool          `bson:"showCardControls"`
	}
	err := m.Database.Collection("org_states").FindOne(ctx, bson.M{"ownerId": ownerID, "chartId": chartID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return map[string]any{"viewport": map[string]any{}, "collapsedIds": []string{}, "showCardControls": true}, nil
	}
	if err != nil {
		return nil, err
	}
	showCardControls := true
	if doc.ShowCardControls != nil {
		showCardControls = *doc.ShowCardControls
	}
	return map[string]any{"viewport": doc.Viewport, "collapsedIds": doc.CollapsedIDs, "showCardControls": showCardControls}, nil
}

func (m *Mongo) PutOrgState(ctx context.Context, ownerID, chartID primitive.ObjectID, state map[string]any) error {
	viewport, _ := state["viewport"].(map[string]any)
	collapsedAny, _ := state["collapsedIds"].([]any)
	collapsed := make([]string, 0, len(collapsedAny))
	for _, v := range collapsedAny {
		if s, ok := v.(string); ok {
			collapsed = append(collapsed, s)
		}
	}
	showCardControls, _ := state["showCardControls"].(bool)

	_, err := m.Database.Collection("org_states").UpdateOne(ctx,
		bson.M{"ownerId": ownerID, "chartId": chartID},
		bson.M{"$set": bson.M{"viewport": viewport, "collapsedIds": collapsed, "showCardControls": showCardControls, "updatedAt": time.Now().UTC()}, "$setOnInsert": bson.M{"createdAt": time.Now().UTC()}},
		options.Update().SetUpsert(true),
	)
	return err
}

func (m *Mongo) GetTimelineByID(ctx context.Context, timelineID primitive.ObjectID) (*Timeline, error) {
	var t Timeline
	err := m.Database.Collection("timelines").FindOne(ctx, bson.M{"_id": timelineID}).Decode(&t)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (m *Mongo) GetTimelineEventsPublic(ctx context.Context, timelineID primitive.ObjectID) ([]map[string]any, error) {
	var doc struct {
		Events []map[string]any `bson:"events"`
	}
	err := m.Database.Collection("timeline_events").FindOne(ctx, bson.M{"timelineId": timelineID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if doc.Events == nil {
		return []map[string]any{}, nil
	}
	return doc.Events, nil
}

func (m *Mongo) GetTimelineStatePublic(ctx context.Context, timelineID primitive.ObjectID) (map[string]any, error) {
	var doc struct {
		Viewport      map[string]any `bson:"viewport"`
		SavedPosition map[string]any `bson:"savedPosition"`
	}
	err := m.Database.Collection("timeline_states").FindOne(ctx, bson.M{"timelineId": timelineID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return map[string]any{"viewport": map[string]any{}, "savedPosition": map[string]any{}}, nil
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"viewport": doc.Viewport, "savedPosition": doc.SavedPosition}, nil
}

func (m *Mongo) GetOrgChartByID(ctx context.Context, chartID primitive.ObjectID) (*OrgChart, error) {
	var c OrgChart
	err := m.Database.Collection("org_charts").FindOne(ctx, bson.M{"_id": chartID}).Decode(&c)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (m *Mongo) GetOrgPeoplePublic(ctx context.Context, chartID primitive.ObjectID) ([]map[string]any, error) {
	var doc struct {
		People []map[string]any `bson:"people"`
	}
	err := m.Database.Collection("org_people").FindOne(ctx, bson.M{"chartId": chartID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if doc.People == nil {
		return []map[string]any{}, nil
	}
	return doc.People, nil
}

func (m *Mongo) GetOrgGroupsPublic(ctx context.Context, chartID primitive.ObjectID) ([]map[string]any, error) {
	var doc struct {
		Groups []map[string]any `bson:"groups"`
	}
	err := m.Database.Collection("org_groups").FindOne(ctx, bson.M{"chartId": chartID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return []map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if doc.Groups == nil {
		return []map[string]any{}, nil
	}
	return doc.Groups, nil
}

func (m *Mongo) GetOrgStatePublic(ctx context.Context, chartID primitive.ObjectID) (map[string]any, error) {
	var doc struct {
		Viewport         map[string]any `bson:"viewport"`
		CollapsedIDs     []string       `bson:"collapsedIds"`
		ShowCardControls *bool          `bson:"showCardControls"`
	}
	err := m.Database.Collection("org_states").FindOne(ctx, bson.M{"chartId": chartID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return map[string]any{"viewport": map[string]any{}, "collapsedIds": []string{}, "showCardControls": true}, nil
	}
	if err != nil {
		return nil, err
	}
	showCardControls := true
	if doc.ShowCardControls != nil {
		showCardControls = *doc.ShowCardControls
	}
	return map[string]any{"viewport": doc.Viewport, "collapsedIds": doc.CollapsedIDs, "showCardControls": showCardControls}, nil
}
