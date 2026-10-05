package main

import (
	"fmt"
	"github.com/serenya/go-cms/internal/interfaces/http"
	"github.com/serenya/go-cms/internal/config"
)

func main() {
	cfg := &config.Config{}
	svcs := http.Services{}
	_, err := http.NewRouter(cfg, nil, svcs)
	fmt.Println("Router built successfully", err)
}
