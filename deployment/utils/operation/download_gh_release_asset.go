package operation

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/config"
)

// Limit decompressed size to 100MB (adjust as needed)
const maxDecompressedSize = 100 * 1024 * 1024

type Artifact struct {
	Path string
	Data []byte
}

type DownloadArtifactsInput struct {
	Organization        string
	Repository          string
	Release             string
	Asset               string
	FilesSuffixToFilter string
}

type DownloadArtifactsOutput struct {
	Artifacts []Artifact
}

var DownloadArtifactsOp = operations.NewOperation(
	"download-artifacts-op",
	semver.MustParse("0.1.0"),
	"Downloads a release tar.gz artifact from Github and extracts and retrieves the files that match with the given filter",
	downloadArtifacts,
)

func downloadArtifacts(b operations.Bundle, _ config.TonDeps, in DownloadArtifactsInput) (DownloadArtifactsOutput, error) {
	output := DownloadArtifactsOutput{}

	url := fmt.Sprintf(
		"https://github.com/%s/%s/releases/download/%s/%s",
		in.Organization, in.Repository, in.Release, in.Asset+".tar.gz",
	)

	rawTarGz, err := getBytesFromURL(b.GetContext(), url)

	if err != nil {
		return output, fmt.Errorf("failed to download contracts from %s: %w", url, err)
	}

	artifacts, err := extractFiles(rawTarGz, in.FilesSuffixToFilter)

	if err != nil {
		return output, fmt.Errorf("failed to extract contracts from .tar.gz %s: %w", url, err)
	}

	output.Artifacts = artifacts

	if len(output.Artifacts) == 0 {
		return output, fmt.Errorf("no artifacts found in the tar.gz file %s with suffix %q", url, in.FilesSuffixToFilter)
	}

	return output, nil
}

func extractFiles(rawTarGz []byte, suffix string) ([]Artifact, error) {
	gzipReader, err := gzip.NewReader(bytes.NewReader(rawTarGz))
	if err != nil {
		return nil, err
	}
	defer func() { _ = gzipReader.Close() }()

	// Limit decompressed size to 100MB
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

		switch header.Typeflag {
		case tar.TypeReg:
			clean := filepath.Clean(header.Name)

			// Only accept root-level files in this current version (no "/")
			if strings.Contains(clean, "/") {
				continue
			}
			if !strings.HasSuffix(clean, suffix) {
				continue
			}
			var buf bytes.Buffer
			// Limit individual file size to prevent DoS
			if _, err := io.Copy(&buf, io.LimitReader(tarReader, maxDecompressedSize)); err != nil {
				return nil, fmt.Errorf("error while read %q: %w", clean, err)
			}
			out = append(out, Artifact{
				Path: clean,
				Data: buf.Bytes(),
			})
		default:
			// skip dirs, symlinks, etc.
		}
	}

	return out, nil
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

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GET %s responded with an error: %s: %s", url, resp.Status, string(b))
	}

	return io.ReadAll(resp.Body)
}
