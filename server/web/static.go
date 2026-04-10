package web

import (
	"embed"
	"io/fs"
)

// distFiles contains the built Vite app copied during server image build.
//
//go:embed dist/**
var distFiles embed.FS

func DistFS() (fs.FS, error) {
	return fs.Sub(distFiles, "dist")
}
