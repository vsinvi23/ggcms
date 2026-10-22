package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/serenya/go-cms/internal/application/identity"
	"golang.org/x/oauth2"
)

type githubProvider struct {
	cfg     *oauth2.Config
	apiBase string
	client  *http.Client
}

func newGitHub(clientID, secret, redirect string, client *http.Client) *githubProvider {
	return &githubProvider{
		cfg: &oauth2.Config{
			ClientID: clientID, ClientSecret: secret, RedirectURL: redirect,
			Scopes:   []string{"read:user", "user:email"},
			Endpoint: oauth2.Endpoint{AuthURL: "https://github.com/login/oauth/authorize", TokenURL: "https://github.com/login/oauth/access_token"},
		},
		apiBase: "https://api.github.com",
		client:  client,
	}
}

func (p *githubProvider) Name() string { return "github" }

func (p *githubProvider) AuthURL(state, _, challenge string) string {
	return p.cfg.AuthCodeURL(state,
		oauth2.SetAuthURLParam("code_challenge", challenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"))
}

func (p *githubProvider) Exchange(ctx context.Context, code, verifier, _ string) (*identity.Claims, error) {
	ctx = context.WithValue(ctx, oauth2.HTTPClient, p.client)
	tok, err := p.cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return nil, fmt.Errorf("github code exchange: %w", err)
	}
	client := p.cfg.Client(ctx, tok)

	var profile struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := p.getJSON(client, "/user", &profile); err != nil {
		return nil, err
	}
	if profile.ID == 0 {
		return nil, fmt.Errorf("github user: missing id")
	}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := p.getJSON(client, "/user/emails", &emails); err != nil {
		return nil, err
	}
	email := ""
	for _, e := range emails {
		if e.Primary && e.Verified {
			email = e.Email
			break
		}
	}

	name := profile.Name
	if name == "" {
		name = profile.Login
	}
	return &identity.Claims{
		Provider:       "github",
		ProviderUserID: strconv.FormatInt(profile.ID, 10),
		Email:          email,
		EmailVerified:  email != "",
		Name:           name,
		AvatarURL:      profile.AvatarURL,
	}, nil
}

func (p *githubProvider) getJSON(client *http.Client, path string, out interface{}) error {
	resp, err := client.Get(p.apiBase + path)
	if err != nil {
		return fmt.Errorf("github %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github %s: status %d", path, resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out); err != nil {
		return fmt.Errorf("github %s parse: %w", path, err)
	}
	return nil
}
