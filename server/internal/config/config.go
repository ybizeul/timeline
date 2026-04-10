package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr            string
	MongoURI            string
	MongoDatabase       string
	SessionSecret       string
	PublicBaseURL       string
	CookieSecure        bool
	CookieSameSite      string
	CookieDomain        string
	OAuthGithubID       string
	OAuthGithubSecret   string
	OAuthGoogleID       string
	OAuthGoogleSecret   string
	OAuthAppleID        string
	OAuthAppleSecret    string
	OAuthFacebookID     string
	OAuthFacebookSecret string
	OAuthLinkedInID     string
	OAuthLinkedInSecret string
	ReadHeaderTimeout   time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:            envOrDefault("HTTP_ADDR", ":8080"),
		MongoURI:            envOrDefault("MONGO_URI", "mongodb://localhost:27017"),
		MongoDatabase:       envOrDefault("MONGO_DATABASE", "timeline"),
		SessionSecret:       os.Getenv("SESSION_SECRET"),
		PublicBaseURL:       envOrDefault("PUBLIC_BASE_URL", "http://localhost:8080"),
		CookieSecure:        envBool("COOKIE_SECURE", false),
		CookieSameSite:      envOrDefault("COOKIE_SAMESITE", "Lax"),
		CookieDomain:        os.Getenv("COOKIE_DOMAIN"),
		OAuthGithubID:       os.Getenv("OAUTH_GITHUB_CLIENT_ID"),
		OAuthGithubSecret:   os.Getenv("OAUTH_GITHUB_CLIENT_SECRET"),
		OAuthGoogleID:       os.Getenv("OAUTH_GOOGLE_CLIENT_ID"),
		OAuthGoogleSecret:   os.Getenv("OAUTH_GOOGLE_CLIENT_SECRET"),
		OAuthAppleID:        os.Getenv("OAUTH_APPLE_CLIENT_ID"),
		OAuthAppleSecret:    os.Getenv("OAUTH_APPLE_CLIENT_SECRET"),
		OAuthFacebookID:     os.Getenv("OAUTH_FACEBOOK_CLIENT_ID"),
		OAuthFacebookSecret: os.Getenv("OAUTH_FACEBOOK_CLIENT_SECRET"),
		OAuthLinkedInID:     os.Getenv("OAUTH_LINKEDIN_CLIENT_ID"),
		OAuthLinkedInSecret: os.Getenv("OAUTH_LINKEDIN_CLIENT_SECRET"),
		ReadHeaderTimeout:   5 * time.Second,
	}

	if v := os.Getenv("READ_HEADER_TIMEOUT_SECONDS"); v != "" {
		s, err := strconv.Atoi(v)
		if err != nil || s <= 0 {
			return Config{}, fmt.Errorf("READ_HEADER_TIMEOUT_SECONDS must be a positive integer")
		}
		cfg.ReadHeaderTimeout = time.Duration(s) * time.Second
	}

	if cfg.SessionSecret == "" {
		return Config{}, fmt.Errorf("SESSION_SECRET is required")
	}

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
