package storage

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

// S3Provider implements Provider using the AWS S3 REST API with SigV4 signing.
// Compatible with AWS S3, MinIO, and Cloudflare R2 (set Endpoint for non-AWS).
type S3Provider struct {
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	Endpoint  string
	PublicURL string
}

func (p *S3Provider) Name() string { return "s3" }

// isAWS reports whether the provider is targeting real AWS S3 (no custom endpoint).
func (p *S3Provider) isAWS() bool { return p.Endpoint == "" }

// baseEndpoint returns the root URL for the S3 service (no bucket prefix).
// For AWS S3 we use the virtual-hosted-style base; for MinIO/R2 we use path-style.
func (p *S3Provider) baseEndpoint() string {
	if p.Endpoint != "" {
		return strings.TrimRight(p.Endpoint, "/")
	}
	// Virtual-hosted-style: bucket is part of the host, not the path.
	return fmt.Sprintf("https://s3.%s.amazonaws.com", p.Region)
}

// objectURL builds the full URL for a specific object key.
func (p *S3Provider) objectURL(key string) string {
	if p.isAWS() {
		// AWS virtual-hosted-style: https://<bucket>.s3.<region>.amazonaws.com/<key>
		return fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", p.Bucket, p.Region, key)
	}
	// Path-style for MinIO / Cloudflare R2 / custom endpoints.
	return fmt.Sprintf("%s/%s/%s", p.baseEndpoint(), p.Bucket, key)
}

// canonicalPath returns the URI path used in the SigV4 canonical request.
// AWS virtual-hosted-style uses /<key>; path-style uses /<bucket>/<key>.
func (p *S3Provider) canonicalPath(key string) string {
	if p.isAWS() {
		return "/" + key
	}
	return "/" + p.Bucket + "/" + key
}

func (p *S3Provider) host() string {
	if p.isAWS() {
		return fmt.Sprintf("%s.s3.%s.amazonaws.com", p.Bucket, p.Region)
	}
	ep := p.baseEndpoint()
	ep = strings.TrimPrefix(ep, "https://")
	ep = strings.TrimPrefix(ep, "http://")
	return ep
}

func (p *S3Provider) Save(file io.Reader, filename string, mimeType string, size int64) (string, string, error) {
	if p.Bucket == "" || p.AccessKey == "" || p.SecretKey == "" {
		return "", "", fmt.Errorf("S3 not fully configured: bucket, access_key, and secret_key are required")
	}
	if p.Region == "" {
		p.Region = "us-east-1" // safe: struct is created fresh per request by GetStorageProvider
	}

	ext := filepath.Ext(filename)
	key := uuid.New().String() + ext

	body, err := io.ReadAll(file)
	if err != nil {
		return "", "", fmt.Errorf("read upload: %w", err)
	}

	now := time.Now().UTC()
	dateISO := now.Format("20060102T150405Z")
	dateShort := now.Format("20060102")
	payloadHash := hexSHA256(body)
	hostVal := p.host()

	req, err := http.NewRequest("PUT", p.objectURL(key), bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}

	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("Host", hostVal)
	req.Header.Set("x-amz-date", dateISO)
	req.Header.Set("x-amz-content-sha256", payloadHash)
	req.ContentLength = int64(len(body))

	signedHeaders := "content-type;host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := "content-type:" + mimeType + "\n" +
		"host:" + hostVal + "\n" +
		"x-amz-content-sha256:" + payloadHash + "\n" +
		"x-amz-date:" + dateISO + "\n"

	canonicalRequest := strings.Join([]string{
		"PUT",
		p.canonicalPath(key),
		"",
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	scope := dateShort + "/" + p.Region + "/s3/aws4_request"
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		dateISO,
		scope,
		hexSHA256([]byte(canonicalRequest)),
	}, "\n")

	sigKey := deriveSigKey(p.SecretKey, dateShort, p.Region, "s3")
	sig := hex.EncodeToString(hmacSHA256(sigKey, stringToSign))

	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s,SignedHeaders=%s,Signature=%s",
		p.AccessKey, scope, signedHeaders, sig)
	req.Header.Set("Authorization", authHeader)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("s3 upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		rb, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("s3 upload failed (%d): %s", resp.StatusCode, string(rb))
	}

	var publicURL string
	if p.PublicURL != "" {
		publicURL = strings.TrimRight(p.PublicURL, "/") + "/" + key
	} else {
		publicURL = p.objectURL(key)
	}
	return key, publicURL, nil
}

func (p *S3Provider) Delete(key string) error {
	if p.Bucket == "" || p.AccessKey == "" || p.SecretKey == "" {
		return fmt.Errorf("S3 not configured")
	}
	now := time.Now().UTC()
	dateISO := now.Format("20060102T150405Z")
	dateShort := now.Format("20060102")
	emptyHash := hexSHA256([]byte{})
	hostVal := p.host()

	req, err := http.NewRequest("DELETE", p.objectURL(key), nil)
	if err != nil {
		return err
	}

	req.Header.Set("Host", hostVal)
	req.Header.Set("x-amz-date", dateISO)
	req.Header.Set("x-amz-content-sha256", emptyHash)

	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := "host:" + hostVal + "\n" +
		"x-amz-content-sha256:" + emptyHash + "\n" +
		"x-amz-date:" + dateISO + "\n"

	canonicalRequest := strings.Join([]string{"DELETE", p.canonicalPath(key), "", canonicalHeaders, signedHeaders, emptyHash}, "\n")
	scope := dateShort + "/" + p.Region + "/s3/aws4_request"
	stringToSign := strings.Join([]string{"AWS4-HMAC-SHA256", dateISO, scope, hexSHA256([]byte(canonicalRequest))}, "\n")
	sigKey := deriveSigKey(p.SecretKey, dateShort, p.Region, "s3")
	sig := hex.EncodeToString(hmacSHA256(sigKey, stringToSign))

	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s,SignedHeaders=%s,Signature=%s",
		p.AccessKey, scope, signedHeaders, sig))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		rb, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("s3 delete failed (%d): %s", resp.StatusCode, string(rb))
	}
	return nil
}

func hexSHA256(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

func deriveSigKey(secret, date, region, service string) []byte {
	k1 := hmacSHA256([]byte("AWS4"+secret), date)
	k2 := hmacSHA256(k1, region)
	k3 := hmacSHA256(k2, service)
	return hmacSHA256(k3, "aws4_request")
}
