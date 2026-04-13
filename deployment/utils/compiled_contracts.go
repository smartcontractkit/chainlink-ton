package utils //nolint:revive,nolintlint

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	// Contract version definitions
	ContractsVersionLocal = "local"
	// Notice: "local" should be used only for development,

	ContractsPackageLatestSupported = "github.com/smartcontractkit/chainlink-ton@contracts/1.6.0" // Feb 19, 2026

	PackageMetadataFile = "contracts-pkg.json"
)

var DeployableCodeHash, _ = hex.DecodeString("61ef207c8cb9d963f1cca85894f3c279edcba27490c192f0be6c3be3f6a520fc")

type CompiledContractData struct {
	// Type is the fully qualified contract name (e.g. bindings.TypeRouter).
	Type       string
	Code       *cell.Cell
	PackageRef string
	Version    *semver.Version
}

// ContractEntryMetadata holds per-contract metadata from contracts-pkg.json.
type ContractEntryMetadata struct {
	Path    string `json:"path"`
	Version string `json:"version"`
}

// ContractPackageMetadata is the schema for contracts-pkg.json bundled in each release.
type ContractPackageMetadata struct {
	Version   string                           `json:"version"`
	Contracts map[string]ContractEntryMetadata `json:"contracts"`
}

// defaultPackageMetadata is used as a fallback for releases prior to the introduction of
// contracts-pkg.json (before 1.6.1). All contracts are assigned version 1.6.0 with their
// original filenames.
var defaultPackageMetadata = &ContractPackageMetadata{
	Version: "1.6.0",
	Contracts: map[string]ContractEntryMetadata{
		bindings.TypeRouter:          {Path: "Router.compiled.json", Version: "1.6.0"},
		bindings.TypeFeeQuoter:       {Path: "FeeQuoter.compiled.json", Version: "1.6.0"},
		bindings.TypeOnRamp:          {Path: "OnRamp.compiled.json", Version: "1.6.0"},
		bindings.TypeOffRamp:         {Path: "OffRamp.compiled.json", Version: "1.6.0"},
		bindings.TypeSendExecutor:    {Path: "CCIPSendExecutor.compiled.json", Version: "1.6.0"},
		bindings.TypeDeployable:      {Path: "Deployable.compiled.json", Version: "1.6.0"},
		bindings.TypeMerkleRoot:      {Path: "MerkleRoot.compiled.json", Version: "1.6.0"},
		bindings.TypeReceiveExecutor: {Path: "ReceiveExecutor.compiled.json", Version: "1.6.0"},
		bindings.TypeTestReceiver:    {Path: "ccip.test.receiver.compiled.json", Version: "1.6.0"},
		bindings.TypeTimelock:        {Path: "mcms.RBACTimelock.compiled.json", Version: "1.6.0"},
		bindings.TypeMCMS:            {Path: "mcms.MCMS.compiled.json", Version: "1.6.0"},
	},
}

// Package e.g:
//   - github.com/smartcontractkit/chainlink-ton@contracts/v1.6.3
//   - /usr/my-contracts-build
//   - local (maps to {repo-root}/contracts/build)
type RetrieveCompiledContractsInput struct {
	Package   string
	Contracts []string // FQN contract types from pkg/bindings/index.go (e.g. bindings.TypeRouter)
}

func (i *RetrieveCompiledContractsInput) Validate() error {
	if i == nil {
		return errors.New("input cannot be nil")
	}

	if _, err := ParseCompiledContractsPackageRef(i.Package); err != nil {
		return err
	}
	return nil
}

type RetrieveCompiledContractsOutput struct {
	CompiledContracts map[string]CompiledContractData // keyed by FQN (e.g. bindings.TypeRouter)
}

func RetrieveCompiledTONContracts(ctx context.Context, logger logger.Logger, in RetrieveCompiledContractsInput) (RetrieveCompiledContractsOutput, error) {
	output := RetrieveCompiledContractsOutput{}

	packageRef, err := ParseCompiledContractsPackageRef(in.Package)
	if err != nil {
		return RetrieveCompiledContractsOutput{}, fmt.Errorf("invalid contracts package ref: %v", err)
	}

	if packageRef.Kind == CompiledContractsPackageKindRepoRef {
		// Download contracts
		downloadArtifactsInput := DownloadArtifactsInput{
			Organization: packageRef.Organization,
			Repository:   packageRef.Repository,
			Release:      in.Package,
			Asset:        AssetNameFromReleaseTag(in.Package),
		}
		downloadArtifactsOutput, err := DownloadArtifacts(ctx, downloadArtifactsInput)
		if err != nil {
			return output, err
		}
		compiledContracts, err := compiledContractsFromArtifacts(filterContractArtifacts(downloadArtifactsOutput.Artifacts), in.Contracts, in.Package)

		return RetrieveCompiledContractsOutput{CompiledContracts: compiledContracts}, nil
		//TODO Cache the results
	}
	// Fetch contracts locally, either from a specified absolute path or from the default repo location

	packagePath := ""
	if packageRef.Kind == CompiledContractsPackageKindAbsPath {
		packagePath = packageRef.AbsPath
	} else if packageRef.Kind == CompiledContractsPackageKindLocal {
		packagePath = helpers.GetBuildsDir(ctx)
	}

	artifacts, err := GetArtifactsFromLocalDir(packagePath)
	compiledContracts, err := compiledContractsFromArtifacts(filterContractArtifacts(artifacts), in.Contracts, in.Package)
	output = RetrieveCompiledContractsOutput{CompiledContracts: compiledContracts}

	return output, nil
}

type CompiledContractsPackageKind string

const (
	CompiledContractsPackageKindLocal   CompiledContractsPackageKind = "local"
	CompiledContractsPackageKindAbsPath CompiledContractsPackageKind = "abs_path"
	CompiledContractsPackageKindRepoRef CompiledContractsPackageKind = "repo_ref"
)

type ContractsPackageRef struct {
	Kind CompiledContractsPackageKind

	// for KindAbsPath
	AbsPath string

	// for KindRepoRef
	Host         string
	Organization string
	Repository   string
	Tag          string
}

func ParseCompiledContractsPackageRef(s string) (*ContractsPackageRef, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, errors.New("contracts package ref cannot be empty")
	}

	if s == "local" {
		return &ContractsPackageRef{
			Kind: CompiledContractsPackageKindLocal,
		}, nil
	}

	if filepath.IsAbs(s) {
		return &ContractsPackageRef{
			Kind:    CompiledContractsPackageKindAbsPath,
			AbsPath: s,
		}, nil
	}

	repo, tag, ok := strings.Cut(s, "@")
	if !ok {
		return nil, fmt.Errorf(
			"invalid contracts package ref %q: must be 'local', an absolute path, or '<host>/<org>/<repo>@<tag>'",
			s,
		)
	}

	repo = strings.TrimSpace(repo)
	tag = strings.TrimSpace(tag)

	if repo == "" {
		return nil, errors.New("repo path cannot be empty")
	}
	if tag == "" {
		return nil, errors.New("tag cannot be empty")
	}
	if strings.Contains(repo, " ") {
		return nil, errors.New("repo path must not contain spaces")
	}
	if strings.Contains(tag, " ") {
		return nil, errors.New("tag must not contain spaces")
	}
	if strings.Contains(tag, "@") {
		return nil, errors.New("tag must not contain '@'")
	}

	parts := strings.Split(repo, "/")
	if len(parts) != 3 {
		return nil, fmt.Errorf(
			"invalid repo path %q: expected format '<host>/<organization>/<repository>'",
			repo,
		)
	}

	host := parts[0]
	org := parts[1]
	repository := parts[2]

	if host == "" || org == "" || repository == "" {
		return nil, fmt.Errorf("invalid repo path %q: host, organization, and repository must be non-empty", repo)
	}

	return &ContractsPackageRef{
		Kind:         CompiledContractsPackageKindRepoRef,
		Host:         host,
		Organization: org,
		Repository:   repository,
		Tag:          tag,
	}, nil
}

func verifyDeployableCodeHash(code *cell.Cell) error {
	if code == nil {
		return errors.New("deployer code cell is nil")
	}
	computedHash := code.Hash()
	expectedHash := DeployableCodeHash

	if !bytes.Equal(computedHash, expectedHash) {
		return fmt.Errorf("code hash mismatch: got %x, expected %x", computedHash, expectedHash)
	}
	return nil
}

// filterContractArtifacts returns only artifacts that are compiled contract files
// (.compiled.json) or the package metadata file (contracts-pkg.json).
func filterContractArtifacts(artifacts []Artifact) []Artifact {
	var out []Artifact
	for _, a := range artifacts {
		if a.Filename == PackageMetadataFile || strings.HasSuffix(a.Filename, contractsFileNameSuffix) {
			out = append(out, a)
		}
	}
	return out
}

// parsePackageMetadata returns the ContractPackageMetadata from the artifacts.
// If no contracts-pkg.json artifact is present (e.g. pre-1.6.1 releases), defaultPackageMetadata is returned.
func parsePackageMetadata(artifacts []Artifact) (*ContractPackageMetadata, error) {
	for _, a := range artifacts {
		if a.Filename != PackageMetadataFile {
			continue
		}
		var meta ContractPackageMetadata
		if err := json.Unmarshal(a.Data, &meta); err != nil {
			return nil, fmt.Errorf("failed to parse %s: %w", PackageMetadataFile, err)
		}
		return &meta, nil
	}
	return defaultPackageMetadata, nil
}

func compiledContractsFromArtifacts(artifacts []Artifact, contracts []string, packageRef string) (map[string]CompiledContractData, error) {
	metadata, err := parsePackageMetadata(artifacts)
	if err != nil {
		return nil, err
	}

	// Build path → (fqn, version) index from metadata entries.
	type entryInfo struct {
		fqn     string
		version *semver.Version
	}
	pathToInfo := make(map[string]entryInfo)
	for fqn, entry := range metadata.Contracts {
		v, err := semver.NewVersion(entry.Version)
		if err != nil {
			return nil, fmt.Errorf("invalid version %q for contract %s: %w", entry.Version, fqn, err)
		}
		pathToInfo[entry.Path] = entryInfo{fqn: fqn, version: v}
	}

	// Build allowed-FQN set if a filter was provided.
	allowedFQNs := make(map[string]struct{}, len(contracts))
	for _, fqn := range contracts {
		allowedFQNs[fqn] = struct{}{}
	}

	compiledContracts := make(map[string]CompiledContractData)
	for _, artifact := range artifacts {
		if artifact.Filename == PackageMetadataFile {
			continue
		}
		info, ok := pathToInfo[artifact.Filename]
		if !ok {
			continue
		}
		if len(allowedFQNs) > 0 {
			if _, allowed := allowedFQNs[info.fqn]; !allowed {
				continue
			}
		}
		contractCode, err := wrappers.ParseCompiledTolkContractFromFileBytes(artifact.Data)
		if err != nil {
			return nil, fmt.Errorf("failed to parse compiled contract from artifact %s: %w", artifact.Filename, err)
		}
		if info.fqn == bindings.TypeDeployable {
			if err = verifyDeployableCodeHash(contractCode); err != nil {
				return nil, fmt.Errorf("deployer code hash verification failed for artifact %s: %w", artifact.Filename, err)
			}
		}
		compiledContracts[info.fqn] = CompiledContractData{
			Code:       contractCode,
			Type:       info.fqn,
			PackageRef: packageRef,
			Version:    info.version,
		}
	}
	return compiledContracts, nil
}
