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

	"github.com/xssnick/tonutils-go/tvm/cell"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	contractsGithubOrganization  = "smartcontractkit"
	contractsGithubRepository    = "chainlink-ton"
	contractsGithubReleasePrefix = "ton-contracts-build-"
	contractsGithubAssetPrefix   = "ton-contracts-build-"
	contractsFileNameSuffix      = ".compiled.json"

	// Contract version definitions
	ContractsVersionLocal = "local"
	// Notice: "local" should be used only for development,
	// while a specific version should be pinned for releases (production deployments).
	ContractsVersionLatestSupported = "054376f21418" // Feb 19, 2026
)

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

func RetrieveCompiledTONContracts(ctx context.Context, logger logger.Logger, in RetrieveCompiledContractsInput) (RetrieveCompiledContractsOutput, error) {
	output := RetrieveCompiledContractsOutput{}

	if err := in.Validate(); err != nil {
		return output, err
	}

	if in.ContractsVersionSha != ContractsVersionLocal {
		// Download contracts
		// TODO we could optimize this even more by passing the file names to extract from the release package
		downloadArtifactsInput := DownloadArtifactsInput{
			Organization:        contractsGithubOrganization,
			Repository:          contractsGithubRepository,
			Release:             contractsGithubReleasePrefix + in.ContractsVersionSha,
			Asset:               contractsGithubAssetPrefix + in.ContractsVersionSha,
			FilesSuffixToFilter: contractsFileNameSuffix,
		}
		downloadArtifactsOutput, err := DownloadArtifacts(ctx, downloadArtifactsInput)

		if err != nil {
			return output, err
		}

		if err := os.MkdirAll(helpers.GetBuildDir(ctx, ""), 0o755); err != nil {
			return output, fmt.Errorf("failed to create dirs to store contracts: %w", err)
		}

		for _, a := range downloadArtifactsOutput.Artifacts {
			// Save the files in the corresponding location so that the deployment operations can find them
			path := helpers.GetBuildDir(ctx, a.Path)

			if err := os.WriteFile(path, a.Data, 0o600); err != nil {
				return output, fmt.Errorf("failed to write contract artifact to path %s: %w", path, err)
			}

			logger.Infof("Saved contractType artifact %s", path)
		}
	} else {
		logger.Infof("Not downloading contracts from Github. Using local version")
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

		contractPath := helpers.GetBuildDir(ctx, contractMetadata.CompiledVersionKey)
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
