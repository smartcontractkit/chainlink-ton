package sequence

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tvm/cell"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"
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
	state.Counter: {
		CompiledVersionKey: "examples.Counter.compiled.json",
	},
}

type RetrieveCompiledContractsSeqInput struct {
	ContractsVersionSha string
	Contracts           []ds.ContractType
}

func (i *RetrieveCompiledContractsSeqInput) Validate() error {
	if strings.TrimSpace(i.ContractsVersionSha) == "" {
		return errors.New("contracts version SHA cannot be empty")
	}

	return nil
}

type RetrieveCompiledContractsSeqOutput struct {
	CompiledContracts map[ds.ContractType]utils.CompiledContractData
}

var RetrieveContractsSequence = operations.NewSequence(
	"ton/sequences/retrieve-ton-contracts",
	semver.MustParse("0.1.0"),
	"Retrieves TON contracts from chainlink-ton repo given a release commit sha",
	retrieveCompiledTONContractsSequence,
)

// IMPORTANT:
//
// This sequence also allows someone to retrieve the contract from a GitHub release
// (or "local" for local development) by passing the commit SHA and a semantic version (semver).
//
// At the moment, we have only one version of the contracts, but in the future we might
// have multiple versions — which is why this parameter is important.
//
// We assume that the current version is 1.6.0 to match the CCIP release. However, in theory,
// there is a single version per contract — but this is something we need to revisit.
func retrieveCompiledTONContractsSequence(b operations.Bundle, dp *dep.DependencyProvider, in RetrieveCompiledContractsSeqInput) (RetrieveCompiledContractsSeqOutput, error) {
	output := RetrieveCompiledContractsSeqOutput{}

	if err := in.Validate(); err != nil {
		return output, err
	}

	if in.ContractsVersionSha != ContractsVersionLocal {
		// Download contracts
		// TODO we could optimize this even more by passing the file names to extract from the release package
		downloadArtifactsInput := operation.DownloadArtifactsInput{
			Organization:        contractsGithubOrganization,
			Repository:          contractsGithubRepository,
			Release:             contractsGithubReleasePrefix + in.ContractsVersionSha,
			Asset:               contractsGithubAssetPrefix + in.ContractsVersionSha,
			FilesSuffixToFilter: contractsFileNameSuffix,
		}
		downloadArtifactsOutput, err := operations.ExecuteOperation(b, operation.DownloadArtifactsOp, dp, downloadArtifactsInput)

		if err != nil {
			return output, err
		}

		if err := os.MkdirAll(helpers.GetBuildDir(b.GetContext(), ""), 0o755); err != nil {
			return output, fmt.Errorf("failed to create dirs to store contracts: %w", err)
		}

		for _, a := range downloadArtifactsOutput.Output.Artifacts {
			// Save the files in the corresponding location so that the deployment operations can find them
			path := helpers.GetBuildDir(b.GetContext(), a.Path)

			if err := os.WriteFile(path, a.Data, 0o600); err != nil {
				return output, fmt.Errorf("failed to write contract artifact to path %s: %w", path, err)
			}

			b.Logger.Infof("Saved contractType artifact %s", path)
		}
	} else {
		b.Logger.Infof("Not downloading contracts from Github. Using local version")
	}

	// If no contractType is specified, let's get all of them
	contractToLookFor := slices.Collect(maps.Keys(contractsMapping))
	if len(in.Contracts) != 0 {
		contractToLookFor = in.Contracts
	}

	output.CompiledContracts = make(map[ds.ContractType]utils.CompiledContractData)
	for _, contractType := range contractToLookFor {
		contractMetadata, ok := contractsMapping[contractType]

		if !ok {
			return output, fmt.Errorf("unknown contractType: %s", contractType)
		}

		contractPath := helpers.GetBuildDir(b.GetContext(), contractMetadata.CompiledVersionKey)
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

		output.CompiledContracts[contractType] = utils.CompiledContractData{
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
