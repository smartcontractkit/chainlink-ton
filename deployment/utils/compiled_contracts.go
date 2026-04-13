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
	contractsFileNameSuffix  = ".compiled.json"

	// Contract version definitions
	ContractsVersionLocal = "local"
	// Notice: "local" should be used only for development,

	ContractsPackageLatestSupported = "github.com/smartcontractkit/chainlink-ton@contracts/1.6.0" // Feb 19, 2026

	PackageMetadataFile = "contracts-pkg.json"
)

var DeployableCodeHash, _ = hex.DecodeString("61ef207c8cb9d963f1cca85894f3c279edcba27490c192f0be6c3be3f6a520fc")

type ContractMappingMetadata struct {
	CompiledVersionKey string
}

type CompiledContractData struct {
	Type                ds.ContractType
	Code                *cell.Cell
	PackageRef          string
	Version		    semver.Version

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

/// Package e.g:
///   - github.com/smartcontractkit/chainlink-ton@contracts/v1.6.3
///   - /usr/my-contracts-build
//    - local (maps to {repo-root}/contracts/build)
type RetrieveCompiledContractsInput struct {
	Package             string
	Contracts           []ds.ContractType
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
	CompiledContracts map[ds.ContractType]CompiledContractData
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
			Organization:        packageRef.Organization,
			Repository:          packageRef.Repository,
			Release:             in.Package,
			Asset:               AssetNameFromReleaseTag(in.Package),
			FilesSuffixToFilter: contractsFileNameSuffix,
		}
		downloadArtifactsOutput, err := DownloadArtifacts(ctx, downloadArtifactsInput)
		if err != nil {
			return output, err
		}
		compiledContracts, err := compiledContractsFromArtifacts(downloadArtifactsOutput.Artifacts, in.Contracts, in.Package)

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

	artifacts, err := GetArtifactsFromLocalDir(packagePath, contractsFileNameSuffix)
	compiledContracts, err := compiledContractsFromArtifacts(artifacts, in.Contracts, in.Package)
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
	Kind         CompiledContractsPackageKind

	// for KindAbsPath
	AbsPath      string

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

type Artifact struct {
	Filename string
	Data []byte
}
// Limit decompressed size to 100MB (adjust as needed)
const maxDecompressedSize = 100 * 1024 * 1024


func GetArtifactsFromLocalDir(dir string, suffix string) ([]Artifact, error) {
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

		if !shouldIncludeRootFile(entry.Name(), suffix) {
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
			Data: data,
		})
	}

	return out, nil
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
		in.Organization, in.Repository, in.Release, in.Asset,
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

		if !shouldIncludeRootFile(header.Name, suffix) {
			continue
		}

		clean := filepath.Clean(header.Name)

		data, err := readLimited(tarReader, maxDecompressedSize, clean)
		if err != nil {
			return nil, err
		}

		out = append(out, Artifact{
			Filename: clean,
			Data: data,
		})
	}

	return out, nil
}

func shouldIncludeRootFile(name, suffix string) bool {
	clean := filepath.Clean(name)

	// Only accept root-level files and disallow any ".."
	if strings.Contains(clean, "/") || strings.Contains(clean, "..") {
		return false
	}
	if clean == "" || clean == "." {
		return false
	}
	if clean == PackageMetadataFile {
		return true
	}
	if suffix != "" && !strings.HasSuffix(clean, suffix) {
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

	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GET %s responded with an error: %s: %s", url, resp.Status, string(b))
	}

	return io.ReadAll(resp.Body)
}

// Convention for asset names: Take the release tag, replace "/" with "-", and append ".tar.gz"
// For example, a release tag like "github.com/smartcontractkit/chainlink-ton@contracts/v1.6.0 will have an asset named contracts-1.6.0.tar.gz"
func AssetNameFromReleaseTag(tag string) string {
	tag = strings.ReplaceAll(tag, "/", "-")
	return fmt.Sprintf("%s.tar.gz", tag)
}

func compiledContractsFromArtifacts(artifacts []Artifact, contracts[]ds.ContractType, packageRef string) (map[ds.ContractType]CompiledContractData, error) {
	// Create and populate a set with the contract types/paths we will accept
	contractsToLookFor := slices.Collect(maps.Keys(contractsMapping))
	if len(contracts) != 0 {
		contractsToLookFor = contracts
	}
	filenameToLookFor := make(map[string]struct{})
	for _, contractType := range contractsToLookFor {
		meta, ok := contractsMapping[contractType]
		if !ok {
			return nil, fmt.Errorf("unknown contractType: %s", contractType)
		}
		filenameToLookFor[meta.CompiledVersionKey] = struct{}{}
	}

	// Return the contracts whose paths match the ones in the mapping
	compiledContracts := make(map[ds.ContractType]CompiledContractData)

	for _, artifact := range artifacts {
		if _, ok := filenameToLookFor[artifact.Filename]; !ok {
			continue
		}
		contractCode, err := wrappers.ParseCompiledTolkContractFromFileBytes(artifact.Data)
		if err != nil {
			return nil, fmt.Errorf("failed to parse compiled contract from artifact %s: %w", artifact.Filename, err)
		}
		// Find the corresponding contract type for this path
		var contractType ds.ContractType
		for ct, meta := range contractsMapping {
			if meta.CompiledVersionKey == artifact.Filename {
				contractType = ct
				break
			}
		}
		if contractType == state.Deployer {
			err = verifyDeployableCodeHash(contractCode)
			if err != nil {
				return nil, fmt.Errorf("deployer code hash verification failed for artifact %s: %w", artifact.Filename, err)
			}
		}
		compiledContracts[contractType] = CompiledContractData{
			Code:         contractCode,
			Type:         contractType,
			PackageRef:   packageRef,
		}
	}
	return compiledContracts, nil
}
