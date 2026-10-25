package config

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	MongoDB  MongoConfig
	JWT      JWTConfig
	Upload   UploadConfig
	Admin    AdminConfig
	OAuth    OAuthConfig
	TLS      TLSConfig
	Import   ImportConfig
	Mailer   MailerConfig
	Recovery RecoveryConfig
	Auth     AuthConfig
	Platform PlatformConfig
}

// PlatformConfig holds analytics, notification, privacy and observability settings.
type PlatformConfig struct {
	AnalyticsIPSalt             string // ANALYTICS_IP_SALT
	AnalyticsRawRetentionDays   int    // ANALYTICS_RAW_RETENTION_DAYS (raw events TTL)
	AnalyticsRollupRetentionDays int   // ANALYTICS_ROLLUP_RETENTION_DAYS (daily rollups TTL)
	AnalyticsQueueSize          int    // ANALYTICS_QUEUE_SIZE
	AnalyticsRollupEnabled      bool   // ANALYTICS_ROLLUP_ENABLED
	APIBaseURL                  string // APP_BASE_URL (public base URL of this API, used in email unsubscribe links)
	EmailWorkerEnabled          bool   // EMAIL_WORKER_ENABLED
	EmailMaxAttempts            int    // EMAIL_MAX_ATTEMPTS
	EmailRetentionDays          int    // RETENTION_EMAIL_QUEUE_DAYS
	NotificationRetentionDays   int    // RETENTION_NOTIFICATIONS_DAYS (read notifications)
	DigestEnabled               bool   // DIGEST_ENABLED
	ConsentPolicyVersion        string // CONSENT_POLICY_VERSION
	MetricsAddr                 string // METRICS_ADDR (internal listener; no auth)
	MetricsToken                string // METRICS_TOKEN (bearer token for /metrics on the main listener)
}

type AuthConfig struct {
	Production        bool
	CookieSecure      bool
	CookieDomain      string
	HIBPEnabled       bool
	LoginReauthWindow time.Duration
	LockThreshold     int
	LockAccountLimit  int
	LockBase          time.Duration
	LockMax           time.Duration
}

type TLSConfig struct {
	Enabled        bool
	CertFile       string // TLS_CERT_FILE — backend HTTPS server cert
	KeyFile        string // TLS_KEY_FILE  — backend HTTPS server key
	CAFile         string // TLS_CA_FILE   — CA cert (verify servers + client certs)
	ClientCertFile string // TLS_CLIENT_CERT_FILE — presented to DBs
	ClientKeyFile  string // TLS_CLIENT_KEY_FILE  — presented to DBs
}

type ServerConfig struct {
	Port     string
	GinMode  string
	LogLevel string // debug | info | warn | error
	LogFile  string // path to log file; empty = console only
}

type DatabaseConfig struct {
	WriteURL string
	ReadURL  string

	// Per-pool limits (the write and read pools are separate). Size them so that
	// instances x (write + read pools) stays under Postgres max_connections.
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

type MongoConfig struct {
	URI      string
	Database string
}

type JWTConfig struct {
	Secret           string
	Issuer           string
	Audience         string
	AccessTTLMinutes int
	RefreshTTLDays   int
}

const MinJWTSecretBytes = 32

type UploadConfig struct {
	Dir     string
	BaseURL string
}

type AdminConfig struct {
	Email    string
	Password string
	Name     string
	// Secondary admin seeded at startup (e.g. geekadmin@geekgully.com)
	GeekAdminEmail    string
	GeekAdminPassword string
	GeekAdminName     string
}

// ImportConfig holds settings for third-party content ingest (e.g. the Python
// "content factory" app that POSTs generated articles/courses to /api/import/ingest).
type ImportConfig struct {
	// FactorySyncSecret is compared against the X-Factory-Sync-Secret request header.
	// Required — there is intentionally no default value. If unset, the ingest
	// endpoint is disabled (every request gets 401) rather than crashing local dev.
	FactorySyncSecret string
	// FactoryProxySecret signs the short-lived service token the /factory proxy injects.
	// Must match the content-factory's FACTORY_PROXY_SECRET. Unset disables the proxy.
	FactoryProxySecret string
	FactoryURL         string
}

// MailerConfig holds SMTP settings for outbound transactional email
// (currently only forgot-password). Not fatal if unset — local dev
// shouldn't require SMTP setup to run the server.
type MailerConfig struct {
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	FromAddress  string
}

// RecoveryConfig holds the shared secret for the break-glass master-admin
// password-recovery endpoint.
type RecoveryConfig struct {
	// AdminRecoverySecret is compared against the X-Admin-Recovery-Secret
	// request header. Required — there is intentionally no default value.
	// If unset, the recovery endpoint is disabled (every request gets 401).
	AdminRecoverySecret string
	// AllowedCIDRs (RECOVERY_ALLOWED_CIDRS, comma-separated) restricts the recovery
	// endpoint to these source networks. Empty allows any address.
	AllowedCIDRs string
}

type OAuthProviderConfig struct {
	Enabled      bool
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type OAuthConfig struct {
	Google      OAuthProviderConfig
	GitHub      OAuthProviderConfig
	LinkedIn    OAuthProviderConfig
	FrontendURL string
}

func Load() *Config {
	// Cloud Run injects PORT — respect it over SERVER_PORT default
	if port := os.Getenv("PORT"); port != "" {
		os.Setenv("SERVER_PORT", port)
	}
	viper.AutomaticEnv()

	viper.SetDefault("SERVER_PORT", "8080")
	viper.SetDefault("GIN_MODE", "debug")
	viper.SetDefault("LOG_LEVEL", "info")
	viper.SetDefault("LOG_FILE", "logs/app.log")
	viper.SetDefault("MONGO_DATABASE", "gg_cms")
	viper.SetDefault("DB_MAX_OPEN_CONNS", 10)
	viper.SetDefault("DB_MAX_IDLE_CONNS", 5)
	viper.SetDefault("DB_CONN_MAX_LIFETIME", "30m")
	viper.SetDefault("DB_CONN_MAX_IDLE_TIME", "5m")
	viper.SetDefault("TLS_ENABLED", false)
	viper.SetDefault("TLS_CERT_FILE", "")
	viper.SetDefault("TLS_KEY_FILE", "")
	viper.SetDefault("TLS_CA_FILE", "")
	viper.SetDefault("TLS_CLIENT_CERT_FILE", "")
	viper.SetDefault("TLS_CLIENT_KEY_FILE", "")
	viper.SetDefault("JWT_ISSUER", "gg-cms")
	viper.SetDefault("JWT_AUDIENCE", "gg-cms-web")
	viper.SetDefault("JWT_ACCESS_TTL_MINUTES", 15)
	viper.SetDefault("JWT_REFRESH_TTL_DAYS", 30)
	viper.SetDefault("COOKIE_SECURE", true)
	viper.SetDefault("LOGIN_LOCK_THRESHOLD", 5)
	viper.SetDefault("LOGIN_LOCK_ACCOUNT_THRESHOLD", 20)
	viper.SetDefault("LOGIN_LOCK_BASE_SECONDS", 30)
	viper.SetDefault("LOGIN_LOCK_MAX_MINUTES", 15)
	viper.SetDefault("UPLOAD_DIR", "./uploads")
	viper.SetDefault("UPLOAD_BASE_URL", "http://localhost:8080/uploads")
	viper.SetDefault("ADMIN_EMAIL", "admin@serenya.com")
	viper.SetDefault("ADMIN_NAME", "Super Admin")
	viper.SetDefault("ADMIN_PASSWORD", "")
	viper.SetDefault("GEEK_ADMIN_EMAIL", "geekadmin@geekgully.com")
	viper.SetDefault("GEEK_ADMIN_NAME", "Geek Admin")
	viper.SetDefault("GEEK_ADMIN_PASSWORD", "")
	viper.SetDefault("ANALYTICS_RAW_RETENTION_DAYS", 90)
	viper.SetDefault("ANALYTICS_ROLLUP_RETENTION_DAYS", 730)
	viper.SetDefault("ANALYTICS_QUEUE_SIZE", 5000)
	viper.SetDefault("ANALYTICS_ROLLUP_ENABLED", true)
	viper.SetDefault("APP_BASE_URL", "http://localhost:8080")
	viper.SetDefault("EMAIL_WORKER_ENABLED", true)
	viper.SetDefault("EMAIL_MAX_ATTEMPTS", 6)
	viper.SetDefault("RETENTION_EMAIL_QUEUE_DAYS", 30)
	viper.SetDefault("RETENTION_NOTIFICATIONS_DAYS", 180)
	viper.SetDefault("DIGEST_ENABLED", true)
	viper.SetDefault("CONSENT_POLICY_VERSION", "2026-01")
	viper.SetDefault("FRONTEND_URL", "http://localhost:5173")
	viper.SetDefault("GOOGLE_REDIRECT_URL", "http://localhost:8080/api/auth/google/callback")
	viper.SetDefault("GITHUB_REDIRECT_URL", "http://localhost:8080/api/auth/github/callback")
	viper.SetDefault("LINKEDIN_REDIRECT_URL", "http://localhost:8080/api/auth/linkedin/callback")

	production := strings.EqualFold(viper.GetString("APP_ENV"), "production")

	cfg := &Config{
		Server: ServerConfig{
			Port:     viper.GetString("SERVER_PORT"),
			GinMode:  viper.GetString("GIN_MODE"),
			LogLevel: viper.GetString("LOG_LEVEL"),
			LogFile:  viper.GetString("LOG_FILE"),
		},
		Database: DatabaseConfig{
			WriteURL: viper.GetString("DB_WRITE_URL"),
			ReadURL:  viper.GetString("DB_READ_URL"),

			MaxOpenConns:    viper.GetInt("DB_MAX_OPEN_CONNS"),
			MaxIdleConns:    viper.GetInt("DB_MAX_IDLE_CONNS"),
			ConnMaxLifetime: viper.GetDuration("DB_CONN_MAX_LIFETIME"),
			ConnMaxIdleTime: viper.GetDuration("DB_CONN_MAX_IDLE_TIME"),
		},
		MongoDB: MongoConfig{
			URI:      viper.GetString("MONGO_URI"),
			Database: viper.GetString("MONGO_DATABASE"),
		},
		JWT: JWTConfig{
			Secret:           viper.GetString("JWT_SECRET"),
			Issuer:           viper.GetString("JWT_ISSUER"),
			Audience:         viper.GetString("JWT_AUDIENCE"),
			AccessTTLMinutes: viper.GetInt("JWT_ACCESS_TTL_MINUTES"),
			RefreshTTLDays:   viper.GetInt("JWT_REFRESH_TTL_DAYS"),
		},
		Upload: UploadConfig{
			Dir:     viper.GetString("UPLOAD_DIR"),
			BaseURL: viper.GetString("UPLOAD_BASE_URL"),
		},
		Admin: AdminConfig{
			Email:             viper.GetString("ADMIN_EMAIL"),
			Password:          viper.GetString("ADMIN_PASSWORD"),
			Name:              viper.GetString("ADMIN_NAME"),
			GeekAdminEmail:    viper.GetString("GEEK_ADMIN_EMAIL"),
			GeekAdminPassword: viper.GetString("GEEK_ADMIN_PASSWORD"),
			GeekAdminName:     viper.GetString("GEEK_ADMIN_NAME"),
		},
		TLS: TLSConfig{
			Enabled:        viper.GetBool("TLS_ENABLED"),
			CertFile:       viper.GetString("TLS_CERT_FILE"),
			KeyFile:        viper.GetString("TLS_KEY_FILE"),
			CAFile:         viper.GetString("TLS_CA_FILE"),
			ClientCertFile: viper.GetString("TLS_CLIENT_CERT_FILE"),
			ClientKeyFile:  viper.GetString("TLS_CLIENT_KEY_FILE"),
		},
		Import: ImportConfig{
			FactorySyncSecret:  viper.GetString("FACTORY_SYNC_SECRET"),
			FactoryProxySecret: viper.GetString("FACTORY_PROXY_SECRET"),
			FactoryURL:         viper.GetString("CONTENT_FACTORY_URL"),
		},
		Mailer: MailerConfig{
			SMTPHost:     viper.GetString("SMTP_HOST"),
			SMTPPort:     viper.GetString("SMTP_PORT"),
			SMTPUsername: viper.GetString("SMTP_USERNAME"),
			SMTPPassword: viper.GetString("SMTP_PASSWORD"),
			FromAddress:  viper.GetString("SMTP_FROM_ADDRESS"),
		},
		Recovery: RecoveryConfig{
			AdminRecoverySecret: viper.GetString("ADMIN_RECOVERY_SECRET"),
			AllowedCIDRs:        viper.GetString("RECOVERY_ALLOWED_CIDRS"),
		},
		OAuth: OAuthConfig{
			Google:      oauthProvider("GOOGLE"),
			GitHub:      oauthProvider("GITHUB"),
			LinkedIn:    oauthProvider("LINKEDIN"),
			FrontendURL: viper.GetString("FRONTEND_URL"),
		},
		Platform: PlatformConfig{
			AnalyticsIPSalt:              viper.GetString("ANALYTICS_IP_SALT"),
			AnalyticsRawRetentionDays:    viper.GetInt("ANALYTICS_RAW_RETENTION_DAYS"),
			AnalyticsRollupRetentionDays: viper.GetInt("ANALYTICS_ROLLUP_RETENTION_DAYS"),
			AnalyticsQueueSize:           viper.GetInt("ANALYTICS_QUEUE_SIZE"),
			AnalyticsRollupEnabled:       viper.GetBool("ANALYTICS_ROLLUP_ENABLED"),
			APIBaseURL:                   viper.GetString("APP_BASE_URL"),
			EmailWorkerEnabled:           viper.GetBool("EMAIL_WORKER_ENABLED"),
			EmailMaxAttempts:             viper.GetInt("EMAIL_MAX_ATTEMPTS"),
			EmailRetentionDays:           viper.GetInt("RETENTION_EMAIL_QUEUE_DAYS"),
			NotificationRetentionDays:    viper.GetInt("RETENTION_NOTIFICATIONS_DAYS"),
			DigestEnabled:                viper.GetBool("DIGEST_ENABLED"),
			ConsentPolicyVersion:         viper.GetString("CONSENT_POLICY_VERSION"),
			MetricsAddr:                  viper.GetString("METRICS_ADDR"),
			MetricsToken:                 viper.GetString("METRICS_TOKEN"),
		},
		Auth: AuthConfig{
			Production:        production,
			CookieSecure:      viper.GetBool("COOKIE_SECURE") || production,
			CookieDomain:      viper.GetString("COOKIE_DOMAIN"),
			HIBPEnabled:       viper.GetBool("PASSWORD_HIBP_ENABLED"),
			LoginReauthWindow: 5 * time.Minute,
			LockThreshold:     viper.GetInt("LOGIN_LOCK_THRESHOLD"),
			LockAccountLimit:  viper.GetInt("LOGIN_LOCK_ACCOUNT_THRESHOLD"),
			LockBase:          time.Duration(viper.GetInt("LOGIN_LOCK_BASE_SECONDS")) * time.Second,
			LockMax:           time.Duration(viper.GetInt("LOGIN_LOCK_MAX_MINUTES")) * time.Minute,
		},
	}

	if cfg.Database.ReadURL == "" {
		cfg.Database.ReadURL = cfg.Database.WriteURL
	}

	if len(cfg.JWT.Secret) < MinJWTSecretBytes || strings.HasPrefix(strings.ToUpper(cfg.JWT.Secret), "CHANGE_ME") {
		log.Fatalf("JWT_SECRET must be set to a real secret of at least %d bytes", MinJWTSecretBytes)
	}

	for name, p := range map[string]OAuthProviderConfig{"GOOGLE": cfg.OAuth.Google, "GITHUB": cfg.OAuth.GitHub, "LINKEDIN": cfg.OAuth.LinkedIn} {
		if p.Enabled && production && !strings.HasPrefix(p.RedirectURL, "https://") {
			log.Fatalf("%s_REDIRECT_URL must be https in production", name)
		}
	}

	if cfg.Import.FactorySyncSecret == "" {
		// Not fatal — local dev shouldn't have to set this up just to run the server.
		// The factory-sync middleware rejects every request with 401 while it's unset.
		log.Println("WARNING: FACTORY_SYNC_SECRET is not set — /api/import/ingest will reject all requests")
	}

	if cfg.Import.FactoryProxySecret != "" && len(cfg.Import.FactoryProxySecret) < MinJWTSecretBytes {
		log.Fatalf("FACTORY_PROXY_SECRET must be at least %d bytes", MinJWTSecretBytes)
	}

	if cfg.Mailer.SMTPHost == "" {
		log.Println("WARNING: SMTP_HOST is not set — forgot-password emails will fail to send")
	}

	if cfg.Recovery.AdminRecoverySecret == "" {
		log.Println("WARNING: ADMIN_RECOVERY_SECRET is not set — /api/admin/recover-password will reject all requests")
	}

	return cfg
}

func oauthProvider(prefix string) OAuthProviderConfig {
	p := OAuthProviderConfig{
		ClientID:     viper.GetString(prefix + "_CLIENT_ID"),
		ClientSecret: viper.GetString(prefix + "_CLIENT_SECRET"),
		RedirectURL:  viper.GetString(prefix + "_REDIRECT_URL"),
	}
	p.Enabled = viper.GetBool(prefix+"_LOGIN_ENABLED") && p.ClientID != "" && p.ClientSecret != "" && p.RedirectURL != ""
	return p
}
