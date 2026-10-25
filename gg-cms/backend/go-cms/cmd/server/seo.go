package main

import (
	"os"
	"strings"
)

const defaultSiteURL = "https://geekgully.com"

func siteBaseURL(frontendURL string) string {
	for _, v := range []string{os.Getenv("PUBLIC_SITE_URL"), frontendURL, defaultSiteURL} {
		if v = strings.TrimRight(strings.TrimSpace(v), "/"); v != "" {
			return v
		}
	}
	return defaultSiteURL
}
