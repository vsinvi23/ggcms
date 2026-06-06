package config

import (
	"log"

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
}

type MongoConfig struct {
	URI      string
	Database string
}

type JWTConfig struct {
	Secret      string
	ExpiryHours int
}

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

type OAuthConfig struct {
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	GitHubClientID     string
	GitHubClientSecret string
	GitHubRedirectURL  string
	FrontendURL        string
	StateHMACSecret    string // uses JWT_SECRET value
}

func Load() *Config {
	viper.AutomaticEnv()

	viper.SetDefault("SERVER_PORT", "8080")
	viper.SetDefault("GIN_MODE", "debug")
	viper.SetDefault("LOG_LEVEL", "info")
	viper.SetDefault("LOG_FILE", "logs/app.log")
	viper.SetDefault("MONGO_DATABASE", "go_cms")
	viper.SetDefault("JWT_EXPIRY_HOURS", 24)
	viper.SetDefault("UPLOAD_DIR", "./uploads")
	viper.SetDefault("UPLOAD_BASE_URL", "http://localhost:8080/uploads")
	viper.SetDefault("ADMIN_EMAIL", "admin@serenya.com")
	viper.SetDefault("ADMIN_NAME", "Super Admin")
	viper.SetDefault("ADMIN_PASSWORD", "")
	viper.SetDefault("GEEK_ADMIN_EMAIL", "geekadmin@geekgully.com")
	viper.SetDefault("GEEK_ADMIN_NAME", "Geek Admin")
	viper.SetDefault("GEEK_ADMIN_PASSWORD", "")
	viper.SetDefault("FRONTEND_URL", "http://localhost:5173")
	viper.SetDefault("GOOGLE_REDIRECT_URL", "http://localhost:8080/api/auth/google/callback")
	viper.SetDefault("GITHUB_REDIRECT_URL", "http://localhost:8080/api/auth/github/callback")

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
		},
		MongoDB: MongoConfig{
			URI:      viper.GetString("MONGO_URI"),
			Database: viper.GetString("MONGO_DATABASE"),
		},
		JWT: JWTConfig{
			Secret:      viper.GetString("JWT_SECRET"),
			ExpiryHours: viper.GetInt("JWT_EXPIRY_HOURS"),
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
		OAuth: OAuthConfig{
			GoogleClientID:     viper.GetString("GOOGLE_CLIENT_ID"),
			GoogleClientSecret: viper.GetString("GOOGLE_CLIENT_SECRET"),
			GoogleRedirectURL:  viper.GetString("GOOGLE_REDIRECT_URL"),
			GitHubClientID:     viper.GetString("GITHUB_CLIENT_ID"),
			GitHubClientSecret: viper.GetString("GITHUB_CLIENT_SECRET"),
			GitHubRedirectURL:  viper.GetString("GITHUB_REDIRECT_URL"),
			FrontendURL:        viper.GetString("FRONTEND_URL"),
			StateHMACSecret:    viper.GetString("JWT_SECRET"),
		},
	}

	if cfg.Database.ReadURL == "" {
		cfg.Database.ReadURL = cfg.Database.WriteURL
	}

	if cfg.JWT.Secret == "" {
		log.Fatal("JWT_SECRET environment variable is required")
	}

	return cfg
}
