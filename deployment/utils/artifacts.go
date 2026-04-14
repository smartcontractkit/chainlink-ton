package utils //nolint:revive,nolintlint

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	contractsFileNameSuffix = ".compiled.json"

	// Limit decompressed size to 100MB (adjust as needed)
	maxDecompressedSize = 100 * 1024 * 1024
)

// githubBaseURL is the base URL for downloading release artifacts.
// Tests can override this to point at an httptest.Server.
var githubDomain = "github.com"
var githubBaseURL = "https://" + githubDomain

// Artifact is a single file retrieved from a contracts release package.
type Artifact struct {
	Filename string
	Data     []byte
}

// GetArtifactsFromLocalDir reads all root-level files from a local directory.
// subdirectories and path-traversal entries are rejected.
func GetArtifactsFromLocalDir(dir string) ([]Artifact, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var out []Artifact

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			return nil, fmt.Errorf("error while stat %q: %w", entry.Name(), err)
		}
		if !info.Mode().IsRegular() {
			continue
		}

		if !isValidRootFile(entry.Name()) {
			continue
		}

		clean := filepath.Clean(entry.Name())
		fullPath := filepath.Join(dir, entry.Name())

		f, err := os.Open(fullPath)
		if err != nil {
			return nil, fmt.Errorf("error while open %q: %w", clean, err)
		}

		data, readErr := readLimited(f, maxDecompressedSize, clean)
		closeErr := f.Close()
		if readErr != nil {
			return nil, readErr
		}
		if closeErr != nil {
			return nil, fmt.Errorf("error while close %q: %w", clean, closeErr)
		}

		out = append(out, Artifact{
			Filename: filepath.Base(clean),
			Data:     data,
		})
	}

	return out, nil
}

type DownloadArtifactsInput struct {
	Host	     string
	Organization string
	Repository   string
	Release      string
	Asset        string
}

type DownloadArtifactsOutput struct {
	Artifacts []Artifact
}

// DownloadArtifacts fetches a release tar.gz from GitHub and extracts all root-level files.
func DownloadArtifacts(ctx context.Context, in DownloadArtifactsInput) (DownloadArtifactsOutput, error) {
	output := DownloadArtifactsOutput{}

	if !(in.Host == githubDomain || in.Host == githubBaseURL) {
		return output, fmt.Errorf("expected %s or %s as a host for remote releases, got %s", githubDomain, githubBaseURL, in.Host)
	}

	url := fmt.Sprintf(
		"%s/%s/%s/releases/download/%s/%s",
		githubBaseURL, in.Organization, in.Repository, in.Release, in.Asset,
	)

	rawTarGz, err := getBytesFromURL(ctx, url)
	if err != nil {
		return output, fmt.Errorf("failed to download contracts from %s: %w", url, err)
	}

	artifacts, err := extractFiles(rawTarGz)
	if err != nil {
		return output, fmt.Errorf("failed to extract contracts from .tar.gz %s: %w", url, err)
	}

	output.Artifacts = artifacts

	if len(output.Artifacts) == 0 {
		return output, fmt.Errorf("no artifacts found in the tar.gz file %s", url)
	}

	return output, nil
}

// AssetNameFromReleaseTag derives the release asset filename from a release tag.
// Convention: replace "/" with "-" and append ".tar.gz".
// For example, "github.com/smartcontractkit/chainlink-ton@contracts/v1.6.0" → "contracts-v1.6.0.tar.gz".
func AssetNameFromReleaseTag(tag string) string {
	tag = strings.ReplaceAll(tag, "/", "-")
	return fmt.Sprintf("%s.tar.gz", tag)
}

func extractFiles(rawTarGz []byte) ([]Artifact, error) {
	gzipReader, err := gzip.NewReader(bytes.NewReader(rawTarGz))
	if err != nil {
		return nil, err
	}
	defer func() { _ = gzipReader.Close() }()

	tarReader := tar.NewReader(io.LimitReader(gzipReader, maxDecompressedSize))

	var out []Artifact

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		if header.Typeflag != tar.TypeReg {
			continue
		}

		if !isValidRootFile(header.Name) {
			continue
		}

		clean := filepath.Clean(header.Name)

		data, err := readLimited(tarReader, maxDecompressedSize, clean)
		if err != nil {
			return nil, err
		}

		out = append(out, Artifact{
			Filename: clean,
			Data:     data,
		})
	}

	return out, nil
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
