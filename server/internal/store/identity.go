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

type User struct {
	ID          primitive.ObjectID `bson:"_id"`
	Email       string             `bson:"email,omitempty"`
	Name        string             `bson:"name,omitempty"`
	AvatarURL   string             `bson:"avatarUrl,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt"`
	LastLoginAt time.Time          `bson:"lastLoginAt"`
}

type oauthAccount struct {
	ID             primitive.ObjectID `bson:"_id,omitempty"`
	UserID         primitive.ObjectID `bson:"userId"`
	Provider       string             `bson:"provider"`
	ProviderUserID string             `bson:"providerUserId"`
	Email          string             `bson:"email,omitempty"`
	Name           string             `bson:"name,omitempty"`
	AvatarURL      string             `bson:"avatarUrl,omitempty"`
	CreatedAt      time.Time          `bson:"createdAt"`
	UpdatedAt      time.Time          `bson:"updatedAt"`
	LastLoginAt    time.Time          `bson:"lastLoginAt"`
}

func (m *Mongo) EnsureIdentityIndexes(ctx context.Context) error {
	accounts := m.Database.Collection("oauth_accounts")
	users := m.Database.Collection("users")

	_, err := accounts.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "provider", Value: 1}, {Key: "providerUserId", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("uniq_provider_subject"),
	})
	if err != nil {
		return fmt.Errorf("create oauth index: %w", err)
	}

	_, err = users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "updatedAt", Value: -1}},
		Options: options.Index().SetName("users_updatedAt_desc"),
	})
	if err != nil {
		return fmt.Errorf("create users index: %w", err)
	}

	return nil
}

func (m *Mongo) UpsertOAuthIdentity(ctx context.Context, provider, providerUserID, email, name, avatarURL string) (*User, error) {
	now := time.Now().UTC()
	accounts := m.Database.Collection("oauth_accounts")
	users := m.Database.Collection("users")

	candidateUserID := primitive.NewObjectID()
	filter := bson.M{"provider": provider, "providerUserId": providerUserID}
	update := bson.M{
		"$set": bson.M{
			"email":       email,
			"name":        name,
			"avatarUrl":   avatarURL,
			"updatedAt":   now,
			"lastLoginAt": now,
		},
		"$setOnInsert": bson.M{
			"userId":         candidateUserID,
			"provider":       provider,
			"providerUserId": providerUserID,
			"createdAt":      now,
		},
	}

	var account oauthAccount
	err := accounts.FindOneAndUpdate(
		ctx,
		filter,
		update,
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	).Decode(&account)
	if err != nil {
		return nil, fmt.Errorf("upsert oauth account: %w", err)
	}

	userFilter := bson.M{"_id": account.UserID}
	userUpdate := bson.M{
		"$set": bson.M{
			"email":       email,
			"name":        name,
			"avatarUrl":   avatarURL,
			"updatedAt":   now,
			"lastLoginAt": now,
		},
		"$setOnInsert": bson.M{
			"createdAt": now,
		},
	}

	if _, err := users.UpdateOne(ctx, userFilter, userUpdate, options.Update().SetUpsert(true)); err != nil {
		return nil, fmt.Errorf("upsert user: %w", err)
	}

	var user User
	if err := users.FindOne(ctx, userFilter).Decode(&user); err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}

	return &user, nil
}
