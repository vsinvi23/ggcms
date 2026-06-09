package database

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"time"

	"github.com/serenya/go-cms/pkg/config"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

func NewMongoDB(cfg *config.MongoConfig, tlsCfg *config.TLSConfig) (*MongoDB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOpts := options.Client().ApplyURI(cfg.URI)

	if tlsCfg != nil && tlsCfg.Enabled {
		tc, err := buildMongoTLSConfig(tlsCfg)
		if err != nil {
			return nil, fmt.Errorf("mongodb TLS config: %w", err)
		}
		clientOpts.SetTLSConfig(tc)
	}

	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		return nil, fmt.Errorf("failed to ping MongoDB: %w", err)
	}

	return &MongoDB{
		Client:   client,
		Database: client.Database(cfg.Database),
	}, nil
}

func buildMongoTLSConfig(cfg *config.TLSConfig) (*tls.Config, error) {
	tc := &tls.Config{MinVersion: tls.VersionTLS12}

	if cfg.CAFile != "" {
		pem, err := os.ReadFile(cfg.CAFile)
		if err != nil {
			return nil, fmt.Errorf("read CA file %q: %w", cfg.CAFile, err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("parse CA cert from %q", cfg.CAFile)
		}
		tc.RootCAs = pool
	}

	if cfg.ClientCertFile != "" && cfg.ClientKeyFile != "" {
		cert, err := tls.LoadX509KeyPair(cfg.ClientCertFile, cfg.ClientKeyFile)
		if err != nil {
			return nil, fmt.Errorf("load client cert %q/%q: %w", cfg.ClientCertFile, cfg.ClientKeyFile, err)
		}
		tc.Certificates = []tls.Certificate{cert}
	}

	return tc, nil
}

func (m *MongoDB) Collection(name string) *mongo.Collection {
	return m.Database.Collection(name)
}
