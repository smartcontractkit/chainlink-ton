package operation

import (
	"context"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"testing"
)

const (
	contractsGithubOrganization  = "smartcontractkit"
	contractsGithubRepository    = "chainlink-ton"
	contractsGithubReleasePrefix = "ton-contracts-build-"
	contractsGithubAssetPrefix   = "ton-contracts-build-"
	contractsFileNameSuffix      = ".compiled.json"
)

// Note: these tests perform real HTTP GETs against GitHub releases.
// If you want to skip in CI sometimes, uncomment the Short guard.
// if testing.Short() { t.Skip("skipping live GitHub download tests in -short mode") }

func TestDownloadContracts_Live_ValidSHA(t *testing.T) {
	getCtx := func() context.Context { return t.Context() }

	const version = "ee7ebd37e432" // known good release tag as of 2025-09-04

	input := DownloadArtifactsInput{
		Organization:        contractsGithubOrganization,
		Repository:          contractsGithubRepository,
		Release:             contractsGithubReleasePrefix + version,
		Asset:               contractsGithubAssetPrefix + version,
		FilesSuffixToFilter: contractsFileNameSuffix,
	}

	b := operations.NewBundle(getCtx, nil, nil)

	out, err := downloadArtifacts(b, TonDeps{}, input)

	if err != nil {
		t.Fatalf("downloadContracts(%s) returned error: %v", version, err)
	}

	if len(out.Artifacts) == 0 {
		t.Fatalf("expected at least one compiled contract file, got 0")
	}
}
