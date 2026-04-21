package utils //nolint:revive,nolintlint

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	// Limit decompressed size to 100MB (adjust as needed)
	maxDecompressedSize = 100 * 1024 * 1024
)

// githubBaseURL is the base URL for downloading release artifacts.
// Tests can override this to point at an httptest.Server.
var githubDomain = "github.com"
var githubBaseURL = "https://" + githubDomain

// Artifact is a generic single file from a contracts package.
// It can be reused by other chain implementations.
type Artifact struct {
	Filename string
	Data     []byte
}

// DownloadArtifactsOpts specifies what to download and where to cache it.
type DownloadArtifactsOpts struct {
	Host         string
	Organization string
	Repository   string
	Release      string
	Asset        string
	PkgsDir      string // base directory for the local package cache; empty = use default
}

// DownloadArtifacts fetches a release tar.gz from GitHub and extracts it to a local directory.
// The destination is derived deterministically from the input fields under PkgsDir.
// If the destination directory already exists, the download is skipped (disk cache).
// Returns local path where the package was extracted into after download.

func DownloadArtifacts(ctx context.Context, in DownloadArtifactsOpts) (string, error) {
	if in.Host != githubDomain && in.Host != githubBaseURL {
		return "", fmt.Errorf("expected %s or %s as a host for remote releases, got %s", githubDomain, githubBaseURL, in.Host)
	}

	destDir, err := packageDestDir(in)
	if err != nil {
		return "", err
	}

	// Cache check: if directory already exists, skip the download.
	if _, err = os.Stat(destDir); err == nil {
		return destDir, nil
	}

	url := fmt.Sprintf(
		"%s/%s/%s/releases/download/%s/%s",
		githubBaseURL, in.Organization, in.Repository, in.Release, in.Asset,
	)

	rawTarGz, err := getBytesFromURL(ctx, url)
	if err != nil {
		return "", fmt.Errorf("failed to download artifacts from %s: %w", url, err)
	}

	if err = os.MkdirAll(destDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create destination directory %s: %w", destDir, err)
	}

	if err = extractFilesToDir(rawTarGz, destDir); err != nil {
		_ = os.RemoveAll(destDir) // clean up partial extraction
		return "", fmt.Errorf("failed to extract artifacts from %s: %w", url, err)
	}

	return destDir, nil
}

// packageDestDir returns the directory where a downloaded package should be stored.
func packageDestDir(in DownloadArtifactsOpts) (string, error) {
	base := in.PkgsDir
	if base == "" {
		cacheDir, err := os.UserCacheDir()
		if err != nil {
			return "", fmt.Errorf("failed to determine user cache dir: %w", err)
		}
		base = filepath.Join(cacheDir, "chainlink-ton", "packages")
	}
	// Derive a stable, filesystem-safe name from org/repo@release.
	name := sanitizePackageName(fmt.Sprintf("%s-%s-%s", in.Organization, in.Repository, in.Release))
	return filepath.Join(base, name), nil
}

// sanitizePackageName replaces characters that are problematic in directory names.
func sanitizePackageName(s string) string {
	return strings.NewReplacer("/", "_", "@", "_", " ", "_", "\\", "_").Replace(s)
}

// AssetNameFromReleaseTag derives the release asset filename from a release tag.
// Convention: replace "/" with "-" and append ".tar.gz".
// For example, "contracts/v1.6.0" → "contracts-v1.6.0.tar.gz".
func AssetNameFromReleaseTag(tag string) string {
	tag = strings.ReplaceAll(tag, "/", "-")
	return tag + ".tar.gz"
}

// extractFilesToDir extracts all root-level files from rawTarGz into destDir.
func extractFilesToDir(rawTarGz []byte, destDir string) error {
	gzipReader, err := gzip.NewReader(bytes.NewReader(rawTarGz))
	if err != nil {
		return err
	}
	defer func() { _ = gzipReader.Close() }()

	tarReader := tar.NewReader(io.LimitReader(gzipReader, maxDecompressedSize))

	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}

		if header.Typeflag != tar.TypeReg {
			continue
		}

		if !isValidRootFile(header.Name) {
			continue
		}

		clean := filepath.Clean(header.Name)
		destPath := filepath.Join(destDir, clean)

		data, err := readLimited(tarReader, maxDecompressedSize, clean)
		if err != nil {
			return err
		}

		if err = os.WriteFile(destPath, data, 0o600); err != nil {
			return fmt.Errorf("failed to write %s: %w", destPath, err)
		}
	}

	return nil
}

// isValidRootFile returns true if name is a safe, root-level file (no path separators or
// ".." components). It does not filter by content type — callers are responsible for that.
func isValidRootFile(name string) bool {
	clean := filepath.Clean(name)

	if strings.ContainsAny(clean, `/\`) || strings.Contains(clean, "..") {
		return false
	}
	if clean == "" || clean == "." {
		return false
	}

	return true
}

func readLimited(r io.Reader, limit int64, name string) ([]byte, error) {
	var buf bytes.Buffer

	n, err := io.Copy(&buf, io.LimitReader(r, limit+1))
	if err != nil {
		return nil, fmt.Errorf("error while read %q: %w", name, err)
	}
	if n > limit {
		return nil, fmt.Errorf("file %q exceeds size limit", name)
	}

	return buf.Bytes(), nil
}

func getBytesFromURL(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	cl := &http.Client{Timeout: 90 * time.Second}
	resp, err := cl.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GET %s responded with an error: %s: %s", url, resp.Status, string(b))
	}

	return io.ReadAll(resp.Body)
}
