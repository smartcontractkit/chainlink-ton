package utils //nolint:revive,nolintlint

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tvm/cell"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	contractsGithubOrganization = "smartcontractkit"
	contractsGithubRepository   = "chainlink-ton"
	contractsFileNameSuffix     = ".compiled.json"

	// release tag prefixes
	contractsGithubReleaseSHAPrefix    = "ton-contracts-build-"    // ton-contracts-build-{sha}
	contractsGithubReleaseSemverPrefix = "ton-contracts-v"         // ton-contracts-v{semver}
	contractsGithubAssetSHAPrefix      = "ton-contracts-build-"    // asset name for sha releases
	contractsGithubAssetSemverPrefix   = "ton-contracts-v"         // asset name for semver releases

	// Contract version definitions
	ContractsVersionLocal = "local"
	// Notice: "local" should be used only for development,
	// while a specific version should be pinned for releases (production deployments).
	ContractsVersionLatestSupported = "054376f21418" // Feb 19, 2026
)

// ContractsSourceKind identifies how compiled contracts should be fetched.
type ContractsSourceKind string

const (
	ContractsSourceKindGithubSemver ContractsSourceKind = "github-semver" // ton-contracts-v{semver} release
	ContractsSourceKindGithubSHA    ContractsSourceKind = "github-sha"    // ton-contracts-build-{sha} release
	ContractsSourceKindLocal        ContractsSourceKind = "local"         // local contracts/build/ directory
)

// ContractsSource is the parsed representation of a contracts ref string.
type ContractsSource struct {
	Kind    ContractsSourceKind
	Version string // semver string (e.g. "1.6.0") or commit sha (e.g. "054376f21418")
	Path    string // only for local with a custom path prefix (ContractsSourceKindLocal)
}

// reHexSHA matches a short commit SHA (6-40 lowercase hex chars) to support the legacy bare-sha format.
var reHexSHA = regexp.MustCompile(`^[0-9a-f]{6,40}$`)

// ParseContractsRef parses a contracts ref string into a ContractsSource.
//
// Supported formats:
//
//	"local"              – read from the repo-root contracts/build/ directory
//	"local:/abs/path"    – read from the given absolute directory
//	"1.6.0" / "v1.6.0"  – GitHub release tagged as ton-contracts-v1.6.0
//	"sha:054376f21418"   – GitHub release tagged as ton-contracts-build-054376f21418
//	"054376f21418"       – legacy bare hex SHA; same as sha: prefix
func ParseContractsRef(ref string) (ContractsSource, error) {
	if ref == "" {
		return ContractsSource{}, errors.New("contracts ref must not be empty")
	}
	if ref == ContractsVersionLocal {
		return ContractsSource{Kind: ContractsSourceKindLocal}, nil
	}
	if strings.HasPrefix(ref, "local:") {
		path := strings.TrimPrefix(ref, "local:")
		if !filepath.IsAbs(path) {
			return ContractsSource{}, fmt.Errorf("local path must be absolute, got: %q", path)
		}
		return ContractsSource{Kind: ContractsSourceKindLocal, Path: path}, nil
	}
	if strings.HasPrefix(ref, "sha:") {
		sha := strings.TrimPrefix(ref, "sha:")
		if sha == "" {
			return ContractsSource{}, errors.New("sha: prefix requires a non-empty commit SHA")
		}
		return ContractsSource{Kind: ContractsSourceKindGithubSHA, Version: sha}, nil
	}
	// Try semver (handles both "1.6.0" and "v1.6.0")
	if _, err := semver.NewVersion(ref); err == nil {
		ver := strings.TrimPrefix(ref, "v")
		return ContractsSource{Kind: ContractsSourceKindGithubSemver, Version: ver}, nil
	}
	// Legacy: bare hex string treated as a commit SHA
	if reHexSHA.MatchString(ref) {
		return ContractsSource{Kind: ContractsSourceKindGithubSHA, Version: ref}, nil
	}
	return ContractsSource{}, fmt.Errorf(
		"invalid contracts ref %q: expected a semver (e.g. \"1.6.0\"), "+
			"sha: prefix (e.g. \"sha:054376f\"), \"local\", or \"local:/abs/path\"", ref,
	)
}

type ContractMappingMetadata struct {
	CompiledVersionKey string
}

type CompiledContractData struct {
	Type               ds.ContractType
	Code               *cell.Cell
	ContractVersionSha string
	ContractPath       string
}

// Eventually, we can move this mapping into a descriptor as part of the contract release package.
var contractsMapping = map[ds.ContractType]ContractMappingMetadata{
	// Core CCIP Contracts
	state.Router: {
		CompiledVersionKey: "Router.compiled.json",
	},
	state.FeeQuoter: {
		CompiledVersionKey: "FeeQuoter.compiled.json",
	},
	state.OnRamp: {
		CompiledVersionKey: "OnRamp.compiled.json",
	},
	state.OffRamp: {
		CompiledVersionKey: "OffRamp.compiled.json",
	},
	// Internal contracts
	state.SendExecutor: {
		CompiledVersionKey: "CCIPSendExecutor.compiled.json",
	},
	state.Deployer: {
		CompiledVersionKey: "Deployable.compiled.json",
	},
	state.MerkleRoot: {
		CompiledVersionKey: "MerkleRoot.compiled.json",
	},
	state.ReceiveExecutor: {
		CompiledVersionKey: "ReceiveExecutor.compiled.json",
	},
	// Utilities
	state.TonReceiver: {
		CompiledVersionKey: "ccip.test.receiver.compiled.json",
	},
	state.Timelock: {
		CompiledVersionKey: "mcms.RBACTimelock.compiled.json",
	},
	state.MCMS: {
		CompiledVersionKey: "mcms.MCMS.compiled.json",
	},
}

type RetrieveCompiledContractsInput struct {
	// ContractsVersionSha accepts any contracts ref string understood by ParseContractsRef:
	// a semver (e.g. "1.6.0"), "sha:<commit>", a bare hex SHA, "local", or "local:/abs/path".
	ContractsVersionSha string
	Contracts           []ds.ContractType
}

func (i *RetrieveCompiledContractsInput) Validate() error {
	if strings.TrimSpace(i.ContractsVersionSha) == "" {
		return errors.New("contracts version SHA cannot be empty")
	}
	return nil
}

type RetrieveCompiledContractsOutput struct {
	CompiledContracts map[ds.ContractType]CompiledContractData
}

func RetrieveCompiledTONContracts(ctx context.Context, lggr logger.Logger, in RetrieveCompiledContractsInput) (RetrieveCompiledContractsOutput, error) {
	output := RetrieveCompiledContractsOutput{}

	if err := in.Validate(); err != nil {
		return output, err
	}

	source, err := ParseContractsRef(in.ContractsVersionSha)
	if err != nil {
		return output, fmt.Errorf("invalid contracts ref: %w", err)
	}

	// buildDir returns the directory where compiled contract files live.
	// For a custom local path we use that directly; otherwise fall back to the
	// repo-root-relative helpers.GetBuildDir.
	buildDir := func(contractPath string) string {
		if source.Kind == ContractsSourceKindLocal && source.Path != "" {
			return filepath.Join(source.Path, contractPath)
		}
		return helpers.GetBuildDir(ctx, contractPath)
	}

	if source.Kind != ContractsSourceKindLocal {
		// Determine the GitHub release tag and asset name from the source kind.
		var releaseTag, assetName string
		switch source.Kind {
		case ContractsSourceKindGithubSemver:
			releaseTag = contractsGithubReleaseSemverPrefix + source.Version
			assetName = contractsGithubAssetSemverPrefix + source.Version
		case ContractsSourceKindGithubSHA:
			releaseTag = contractsGithubReleaseSHAPrefix + source.Version
			assetName = contractsGithubAssetSHAPrefix + source.Version
		}

		downloadArtifactsInput := DownloadArtifactsInput{
			Organization:        contractsGithubOrganization,
			Repository:          contractsGithubRepository,
			Release:             releaseTag,
			Asset:               assetName,
			FilesSuffixToFilter: contractsFileNameSuffix,
		}
		downloadArtifactsOutput, err := DownloadArtifacts(ctx, downloadArtifactsInput)
		if err != nil {
			return output, err
		}

		if err := os.MkdirAll(buildDir(""), 0o755); err != nil {
			return output, fmt.Errorf("failed to create dirs to store contracts: %w", err)
		}

		for _, a := range downloadArtifactsOutput.Artifacts {
			path := buildDir(a.Path)
			if err := os.WriteFile(path, a.Data, 0o600); err != nil {
				return output, fmt.Errorf("failed to write contract artifact to path %s: %w", path, err)
			}
			lggr.Infof("Saved contractType artifact %s", path)
		}
	} else {
		lggr.Infof("Not downloading contracts from Github. Using local version")
	}

	// If no contractType is specified, let's get all of them
	contractToLookFor := slices.Collect(maps.Keys(contractsMapping))
	if len(in.Contracts) != 0 {
		contractToLookFor = in.Contracts
	}

	output.CompiledContracts = make(map[ds.ContractType]CompiledContractData)
	for _, contractType := range contractToLookFor {
		contractMetadata, ok := contractsMapping[contractType]

		if !ok {
			return output, fmt.Errorf("unknown contractType: %s", contractType)
		}

		contractPath := buildDir(contractMetadata.CompiledVersionKey)
		contractCode, err := wrappers.ParseCompiledContract(contractPath)
		if err != nil {
			return output, fmt.Errorf("failed to compile %s contractType: %w", contractType, err)
		}

		if contractType == state.Deployer {
			err = verifyDeployerCodeHash(contractCode)
			if err != nil {
				return output, fmt.Errorf("deployer code hash verification failed: %w", err)
			}
		}

		output.CompiledContracts[contractType] = CompiledContractData{
			Code:               contractCode,
			ContractVersionSha: in.ContractsVersionSha,
			Type:               contractType,
			ContractPath:       contractPath,
		}
	}

	return output, nil
}

func verifyDeployerCodeHash(code *cell.Cell) error {
	if code == nil {
		return errors.New("deployer code cell is nil")
	}
	computedHash := code.Hash()
	expectedHash, err := hex.DecodeString(
		"61ef207c8cb9d963f1cca85894f3c279edcba27490c192f0be6c3be3f6a520fc",
	)
	if err != nil {
		return fmt.Errorf("invalid expected hash: %w", err)
	}

	if !bytes.Equal(computedHash, expectedHash) {
		return fmt.Errorf("code hash mismatch: got %x, expected %x", computedHash, expectedHash)
	}
	return nil
}

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

func DownloadArtifacts(ctx context.Context, in DownloadArtifactsInput) (DownloadArtifactsOutput, error) {
	output := DownloadArtifactsOutput{}

	url := fmt.Sprintf(
		"https://github.com/%s/%s/releases/download/%s/%s",
		in.Organization, in.Repository, in.Release, in.Asset+".tar.gz",
	)

	rawTarGz, err := getBytesFromURL(ctx, url)

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

			// Only accept root-level files in this current version (no "/") and disallow any occurrence of ".." in the name
			if strings.Contains(clean, "/") || strings.Contains(clean, "..") {
				continue
			}
			// Reject empty, current-dir
			if clean == "" || clean == "." {
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

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GET %s responded with an error: %s: %s", url, resp.Status, string(b))
	}

	return io.ReadAll(resp.Body)
}
