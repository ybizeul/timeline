package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/sessions"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/apple"
	"github.com/markbates/goth/providers/facebook"
	"github.com/markbates/goth/providers/github"
	"github.com/markbates/goth/providers/google"
	"github.com/markbates/goth/providers/linkedin"
	"timeline/server/internal/config"
	"timeline/server/internal/store"
)

var ErrProviderDisabled = errors.New("provider is not configured")
var ErrNotAuthenticated = errors.New("not authenticated")

type SessionUser struct {
	LocalUserID string `json:"localUserId"`
	Provider    string `json:"provider"`
	UserID      string `json:"userId"`
	Email       string `json:"email"`
	Name        string `json:"name"`
	AvatarURL   string `json:"avatarUrl"`
}

type Manager struct {
	store         *sessions.CookieStore
	sessionName   string
	enabledByName map[string]bool
	mongo         *store.Mongo
}

func NewManager(cfg config.Config, mongoConn *store.Mongo) (*Manager, error) {
	store := sessions.NewCookieStore([]byte(cfg.SessionSecret))
	store.Options = &sessions.Options{
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: parseSameSite(cfg.CookieSameSite),
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
	}
	if cfg.CookieDomain != "" {
		store.Options.Domain = cfg.CookieDomain
	}

	gothic.Store = store

	enabledByName := map[string]bool{
		"github":   false,
		"google":   false,
		"apple":    false,
		"facebook": false,
		"linkedin": false,
	}

	base := strings.TrimRight(cfg.PublicBaseURL, "/")
	providers := make([]goth.Provider, 0, 5)

	if cfg.OAuthGithubID != "" && cfg.OAuthGithubSecret != "" {
		providers = append(providers, github.New(cfg.OAuthGithubID, cfg.OAuthGithubSecret, callbackURL(base, "github"), "read:user", "user:email"))
		enabledByName["github"] = true
	}
	if cfg.OAuthGoogleID != "" && cfg.OAuthGoogleSecret != "" {
		providers = append(providers, google.New(cfg.OAuthGoogleID, cfg.OAuthGoogleSecret, callbackURL(base, "google"), "openid", "profile", "email"))
		enabledByName["google"] = true
	}
	if cfg.OAuthAppleID != "" && cfg.OAuthAppleSecret != "" {
		providers = append(providers, apple.New(cfg.OAuthAppleID, cfg.OAuthAppleSecret, callbackURL(base, "apple"), nil, "name", "email"))
		enabledByName["apple"] = true
	}
	if cfg.OAuthFacebookID != "" && cfg.OAuthFacebookSecret != "" {
		providers = append(providers, facebook.New(cfg.OAuthFacebookID, cfg.OAuthFacebookSecret, callbackURL(base, "facebook"), "public_profile", "email"))
		enabledByName["facebook"] = true
	}
	if cfg.OAuthLinkedInID != "" && cfg.OAuthLinkedInSecret != "" {
		providers = append(providers, linkedin.New(cfg.OAuthLinkedInID, cfg.OAuthLinkedInSecret, callbackURL(base, "linkedin"), "r_liteprofile", "r_emailaddress"))
		enabledByName["linkedin"] = true
	}

	if len(providers) > 0 {
		goth.UseProviders(providers...)
	}

	return &Manager{store: store, sessionName: "timeline_session", enabledByName: enabledByName, mongo: mongoConn}, nil
}

func (m *Manager) ProviderStatuses() []map[string]any {
	return []map[string]any{
		{"id": "github", "enabled": m.enabledByName["github"]},
		{"id": "google", "enabled": m.enabledByName["google"]},
		{"id": "apple", "enabled": m.enabledByName["apple"]},
		{"id": "facebook", "enabled": m.enabledByName["facebook"]},
		{"id": "linkedin", "enabled": m.enabledByName["linkedin"]},
	}
}

func (m *Manager) BeginAuth(w http.ResponseWriter, r *http.Request, provider string) error {
	if !m.enabledByName[provider] {
		return ErrProviderDisabled
	}
	gothic.BeginAuthHandler(w, withProvider(r, provider))
	return nil
}

func (m *Manager) CompleteAuth(w http.ResponseWriter, r *http.Request, provider string) (SessionUser, error) {
	if !m.enabledByName[provider] {
		return SessionUser{}, ErrProviderDisabled
	}

	req := withProvider(r, provider)
	user, err := gothic.CompleteUserAuth(w, req)
	if err != nil {
		return SessionUser{}, err
	}
	if m.mongo == nil {
		return SessionUser{}, errors.New("identity store is not configured")
	}

	persisted, err := m.mongo.UpsertOAuthIdentity(r.Context(), provider, user.UserID, user.Email, firstNonEmpty(user.Name, strings.TrimSpace(user.FirstName+" "+user.LastName), user.NickName), user.AvatarURL)
	if err != nil {
		return SessionUser{}, err
	}

	sess, err := m.store.Get(r, m.sessionName)
	if err != nil {
		return SessionUser{}, err
	}

	sess.Values["authenticated"] = true
	sess.Values["local_user_id"] = persisted.ID.Hex()
	sess.Values["provider"] = provider
	sess.Values["user_id"] = user.UserID
	sess.Values["email"] = user.Email
	sess.Values["name"] = firstNonEmpty(user.Name, strings.TrimSpace(user.FirstName+" "+user.LastName), user.NickName)
	sess.Values["avatar_url"] = user.AvatarURL
	if err := sess.Save(r, w); err != nil {
		return SessionUser{}, err
	}

	_ = gothic.Logout(w, req)

	return SessionUser{
		LocalUserID: persisted.ID.Hex(),
		Provider:    provider,
		UserID:      user.UserID,
		Email:       user.Email,
		Name:        firstNonEmpty(user.Name, strings.TrimSpace(user.FirstName+" "+user.LastName), user.NickName),
		AvatarURL:   user.AvatarURL,
	}, nil
}

func (m *Manager) CurrentUser(r *http.Request) (SessionUser, error) {
	sess, err := m.store.Get(r, m.sessionName)
	if err != nil {
		return SessionUser{}, err
	}
	authenticated, _ := sess.Values["authenticated"].(bool)
	if !authenticated {
		return SessionUser{}, ErrNotAuthenticated
	}

	user := SessionUser{
		LocalUserID: asString(sess.Values["local_user_id"]),
		Provider:    asString(sess.Values["provider"]),
		UserID:      asString(sess.Values["user_id"]),
		Email:       asString(sess.Values["email"]),
		Name:        asString(sess.Values["name"]),
		AvatarURL:   asString(sess.Values["avatar_url"]),
	}
	if user.LocalUserID == "" || user.Provider == "" || user.UserID == "" {
		return SessionUser{}, ErrNotAuthenticated
	}
	return user, nil
}

func (m *Manager) Logout(w http.ResponseWriter, r *http.Request) error {
	sess, err := m.store.Get(r, m.sessionName)
	if err != nil {
		return err
	}
	sess.Options.MaxAge = -1
	sess.Values = map[interface{}]interface{}{}
	return sess.Save(r, w)
}

func callbackURL(baseURL, provider string) string {
	return fmt.Sprintf("%s/api/auth/%s/callback", baseURL, provider)
}

func withProvider(r *http.Request, provider string) *http.Request {
	clone := r.Clone(r.Context())
	q := clone.URL.Query()
	q.Set("provider", provider)
	clone.URL.RawQuery = q.Encode()
	return clone
}

func parseSameSite(v string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "strict":
		return http.SameSiteStrictMode
	case "none":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}

func asString(v interface{}) string {
	s, _ := v.(string)
	return s
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func RedirectWithError(w http.ResponseWriter, r *http.Request, message string) {
	target := "/?authError=" + url.QueryEscape(message)
	http.Redirect(w, r, target, http.StatusFound)
}

type contextKey string

const sessionUserContextKey contextKey = "sessionUser"

func UserFromContext(ctx context.Context) (SessionUser, bool) {
	user, ok := ctx.Value(sessionUserContextKey).(SessionUser)
	return user, ok
}

func (m *Manager) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, err := m.CurrentUser(r)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"authentication required"}`))
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionUserContextKey, user)))
	})
}

func (m *Manager) SessionName() string {
	return m.sessionName
}

func (m *Manager) ForceSessionForTest(w http.ResponseWriter, r *http.Request, user SessionUser) error {
	if user.LocalUserID == "" {
		return errors.New("local user id is required")
	}
	sess, err := m.store.Get(r, m.sessionName)
	if err != nil {
		return err
	}
	sess.Values["authenticated"] = true
	sess.Values["local_user_id"] = user.LocalUserID
	sess.Values["provider"] = user.Provider
	sess.Values["user_id"] = user.UserID
	sess.Values["email"] = user.Email
	sess.Values["name"] = user.Name
	sess.Values["avatar_url"] = user.AvatarURL
	return sess.Save(r, w)
}

func RequestWithSessionCookie(rec *httptest.ResponseRecorder, req *http.Request) *http.Request {
	for _, c := range rec.Result().Cookies() {
		req.AddCookie(c)
	}
	return req
}
