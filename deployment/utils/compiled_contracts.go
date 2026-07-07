package utils //nolint:revive,nolintlint

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	// ContractsVersionLocal should be used only for development.
	ContractsVersionLocal = "local"

	ContractsPackageLatestSupported = "github.com/smartcontractkit/chainlink-ton@contracts/1.6.0" // Feb 19, 2026

	PackageMetadataFile = "contracts-pkg.json"
)

var DeployableCodeHash = func() []byte {
	v, err := hex.DecodeString("61ef207c8cb9d963f1cca85894f3c279edcba27490c192f0be6c3be3f6a520fc")
	if err != nil {
		panic(fmt.Sprintf("invalid deployable code hash: %v", err))
	}
	return v
}()

// ContractEntryMetadata holds per-contract metadata from contracts-pkg.json.
type ContractEntryMetadata struct {
	Path    string `json:"path"`
	Version string `json:"version"`
}

// ContractPackageMetadata is the schema for contracts-pkg.json bundled in each release.
type ContractPackageMetadata struct {
	Version   string                                           `json:"version"`
	Contracts map[tvm.FullyQualifiedName]ContractEntryMetadata `json:"contracts"`
}

// defaultPackageMetadata is used as a fallback for releases prior to the introduction of
// contracts-pkg.json (before 1.6.1). All contracts are assigned version 1.6.0 with their
// original filenames.
var defaultPackageMetadata = &ContractPackageMetadata{
	Version: "1.6.0",
	Contracts: map[tvm.FullyQualifiedName]ContractEntryMetadata{
		bindings.TypeRouter:          {Path: "Router.compiled.json", Version: "1.6.0"},
		bindings.TypeFeeQuoter:       {Path: "FeeQuoter.compiled.json", Version: "1.6.0"},
		bindings.TypeOnRamp:          {Path: "OnRamp.compiled.json", Version: "1.6.0"},
		bindings.TypeOffRamp:         {Path: "OffRamp.compiled.json", Version: "1.6.0"},
		bindings.TypeSendExecutor:    {Path: "CCIPSendExecutor.compiled.json", Version: "1.6.0"},
		bindings.TypeDeployable:      {Path: "Deployable.compiled.json", Version: "1.6.0"},
		bindings.TypeMerkleRoot:      {Path: "MerkleRoot.compiled.json", Version: "1.6.0"},
		bindings.TypeReceiveExecutor: {Path: "ReceiveExecutor.compiled.json", Version: "1.6.0"},
		bindings.TypeTestReceiver:    {Path: "ccip.test.receiver.compiled.json", Version: "1.6.0"},
		bindings.TypeTimelock:        {Path: "mcms.RBACTimelock.compiled.json", Version: "0.0.3"},
		bindings.TypeMCMS:            {Path: "mcms.MCMS.compiled.json", Version: "0.0.4"},
	},
}

// Package e.g:
//   - github.com/smartcontractkit/chainlink-ton@contracts/v1.6.3
//   - /usr/my-contracts-build
//   - local (maps to {repo-root}/contracts/build)
type RetrieveCompiledContractsOpts struct {
	Package   string
	Contracts []tvm.FullyQualifiedName // Fully qualified contract names from pkg/bindings/index.go (e.g. bindings.TypeRouter)
	PkgsDir   string                   // optional base directory for the local package cache (passed through to DownloadArtifacts)
}

// RetrieveCompiledTONContracts resolves the package path, reads the package metadata,
// and loads each requested contract individually from disk.
// returns map[tvm.FullyQualifiedName]ton.CompiledContract, keyed by Fully Qualified Name (e.g. bindings.TypeRouter = link.chain.ton.ccip.Router)
func RetrieveCompiledTONContracts(ctx context.Context, log logger.Logger, in *RetrieveCompiledContractsOpts) (map[tvm.FullyQualifiedName]ton.CompiledContract, error) {
	if in == nil {
		return nil, errors.New("input options cannot be nil")
	}
	packageRef, err := ParseCompiledContractsPackageRef(in.Package)
	if err != nil {
		return nil, fmt.Errorf("invalid contracts package ref: %w", err)
	}

	pkgPath, err := packageRef.FetchPackage(ctx, log, in.PkgsDir)
	if err != nil {
		return nil, err
	}

	meta, err := LoadPackageMetadata(pkgPath)
	if err != nil {
		return nil, err
	}

	contractFQNs := in.Contracts
	if len(contractFQNs) == 0 {
		// No filter: collect all contract names from metadata.
		contractFQNs = make([]tvm.FullyQualifiedName, 0, len(meta.Contracts))
		for contractName := range meta.Contracts {
			contractFQNs = append(contractFQNs, contractName)
		}
	}

	compiledContracts := make(map[tvm.FullyQualifiedName]ton.CompiledContract, len(contractFQNs))
	for _, contractFQN := range contractFQNs {
		contract, err := ReadCompiledContract(ton.ContractMetadata{Package: in.Package, ID: contractFQN}, pkgPath, meta)
		if err != nil {
			return nil, err
		}
		compiledContracts[contractFQN] = contract
	}

	return compiledContracts, nil
}

// ReadCompiledContract reads a single compiled contract from pkgPath using the provided
// metadata. If meta is nil it is loaded from the package-metadata file in pkgPath.
//
// pkgPath is the directory where the package files (contracts-pkg.json + *.compiled.json)
// live. It must already be present on disk; callers are responsible for resolving / downloading
// the package before calling this function.
func ReadCompiledContract(contractMeta ton.ContractMetadata, pkgPath string, meta *ContractPackageMetadata) (ton.CompiledContract, error) {
	if meta == nil {
		var err error
		meta, err = LoadPackageMetadata(pkgPath)
		if err != nil {
			return ton.CompiledContract{}, err
		}
	}

	entry, ok := meta.Contracts[contractMeta.ID]
	if !ok {
		return ton.CompiledContract{}, fmt.Errorf("contract %q not found in package metadata", contractMeta.ID)
	}

	version, err := semver.NewVersion(entry.Version)
	if err != nil {
		return ton.CompiledContract{}, fmt.Errorf("invalid version %q for contract %s: %w", entry.Version, contractMeta.ID, err)
	}

	filePath := filepath.Join(pkgPath, entry.Path)
	data, err := os.ReadFile(filePath)
	if err != nil {
		return ton.CompiledContract{}, fmt.Errorf("failed to read contract file %s: %w", filePath, err)
	}

	code, err := wrappers.ParseCompiledTolkContractFromFileBytes(data)
	if err != nil {
		return ton.CompiledContract{}, fmt.Errorf("failed to parse compiled contract %s: %w", entry.Path, err)
	}

	if contractMeta.ID == bindings.TypeDeployable {
		if err = verifyDeployableCodeHash(code); err != nil {
			return ton.CompiledContract{}, fmt.Errorf("deployer code hash verification failed for %s: %w", entry.Path, err)
		}
	}

	return ton.CompiledContract{
		Metadata: contractMeta,
		Code:     code,
		Version:  version,
	}, nil
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

	if host != "https://github.com" && host != "github.com" {
		return nil, fmt.Errorf("unsupported host %q: only github.com is supported", host)
	}

	return &ContractsPackageRef{
		Kind:         CompiledContractsPackageKindRepoRef,
		Host:         host,
		Organization: org,
		Repository:   repository,
		Tag:          tag,
	}, nil
}

// FetchPackage returns the local directory for a package, downloading and extracting
// it first when it is a remote GitHub release (disk-cached).
func (ref *ContractsPackageRef) FetchPackage(ctx context.Context, log logger.Logger, pkgsDir string) (string, error) {
	switch ref.Kind {
	case CompiledContractsPackageKindAbsPath:
		return ref.AbsPath, nil
	case CompiledContractsPackageKindLocal:
		return helpers.GetBuildsDir(ctx), nil
	case CompiledContractsPackageKindRepoRef:
		downloadInput := DownloadArtifactsOpts{
			Host:         ref.Host,
			Organization: ref.Organization,
			Repository:   ref.Repository,
			Release:      ref.Tag,
			Asset:        AssetNameFromReleaseTag(ref.Tag),
			PkgsDir:      pkgsDir,
		}
		path, err := DownloadArtifacts(ctx, downloadInput)
		if err != nil {
			return "", err
		}
		log.Debugf("contracts package available at %s", path)
		return path, nil
	default:
		return "", fmt.Errorf("unknown package kind %q", ref.Kind)
	}
}

// readPackageMetadata reads contracts-pkg.json from pkgPath.
// Falls back to defaultPackageMetadata when the file is absent (pre-1.6.1 releases).
func (m *ContractPackageMetadata) ReadFrom(pkgPath string) error {
	metaPath := filepath.Join(pkgPath, PackageMetadataFile)
	data, err := os.ReadFile(metaPath)
	if errors.Is(err, os.ErrNotExist) {
		*m = *defaultPackageMetadata
		return nil
	}
	if err != nil {
		return fmt.Errorf("failed to read %s: %w", PackageMetadataFile, err)
	}
	if err := json.Unmarshal(data, m); err != nil {
		return fmt.Errorf("failed to parse %s: %w", PackageMetadataFile, err)
	}
	return nil
}

func LoadPackageMetadata(pkgPath string) (*ContractPackageMetadata, error) {
	var m ContractPackageMetadata
	err := m.ReadFrom(pkgPath)
	if err != nil {
		return nil, err
	}
	return &m, err
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
