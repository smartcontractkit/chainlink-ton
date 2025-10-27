package sequence

import (
	"errors"
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"

	"github.com/Masterminds/semver/v3"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	contractsGithubOrganization  = "smartcontractkit"
	contractsGithubRepository    = "chainlink-ton"
	contractsGithubReleasePrefix = "ton-contracts-build-"
	contractsGithubAssetPrefix   = "ton-contracts-build-"
	contractsFileNameSuffix      = ".compiled.json"
	ContractsLocalVersion        = "local"
)

type ContractMappingMetadata struct {
	CompiledVersionKey             string
	SuggestedTONCoinsForDeployment string
}

// Eventually, we can move this mapping into a descriptor as part of the contract release package.
var contractsMapping = map[ds.ContractType]ContractMappingMetadata{
	// Core CCIP Contracts
	state.Router: ContractMappingMetadata{
		CompiledVersionKey:             "Router.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	state.FeeQuoter: ContractMappingMetadata{
		CompiledVersionKey:             "FeeQuoter.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	state.OnRamp: {
		CompiledVersionKey:             "OnRamp.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	state.OffRamp: {
		CompiledVersionKey:             "OffRamp.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	// Internal contracts
	state.SendExecutor: {
		CompiledVersionKey:             "CCIPSendExecutor.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	state.Deployer: {
		CompiledVersionKey:             "Deployable.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	state.MerkleRoot: {
		CompiledVersionKey:             "MerkleRoot.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	state.ReceiveExecutor: {
		CompiledVersionKey:             "ReceiveExecutor.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	// Utilities
	state.TonReceiver: {
		CompiledVersionKey:             "ccip.test.receiver.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
	state.Timelock: {
		CompiledVersionKey:             "mcms.RBACTimelock.compiled.json",
		SuggestedTONCoinsForDeployment: "0.5",
	},
	state.Counter: {
		CompiledVersionKey:             "examples.Counter.compiled.json",
		SuggestedTONCoinsForDeployment: "0.05",
	},
}

type CompiledContractData struct {
	Type                           ds.ContractType
	Code                           *cell.Cell
	SuggestedTONCoinsForDeployment string
	ContractVersionSha             string
	ContractSemver                 *semver.Version
}

type RetrieveCompiledContractsSeqInput struct {
	ContractsVersionSha string
	ContractsSemver     *semver.Version
	Contracts           []ds.ContractType
}

func (i *RetrieveCompiledContractsSeqInput) Validate() error {
	if strings.TrimSpace(i.ContractsVersionSha) == "" {
		return errors.New("contracts version SHA cannot be empty")
	}

	if i.ContractsSemver == nil || !i.ContractsSemver.Equal(semver.MustParse("1.6.0")) {
		return fmt.Errorf("unsupported version %s. Only contract's version 1.6.0 is supported at the moment", i.ContractsSemver)
	}

	return nil
}

type RetrieveCompiledContractsSeqOutput struct {
	CompiledContracts map[ds.ContractType]CompiledContractData
}

var RetrieveContractsSequence = operations.NewSequence(
	"retrieve-ton-contracts-seq",
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
func retrieveCompiledTONContractsSequence(b operations.Bundle, deps operation.TonDeps, in RetrieveCompiledContractsSeqInput) (RetrieveCompiledContractsSeqOutput, error) {
	output := RetrieveCompiledContractsSeqOutput{}

	if err := in.Validate(); err != nil {
		return output, err
	}

	if in.ContractsVersionSha != ContractsLocalVersion {
		// Download contracts
		// TODO we could optimize this even more by passing the file names to extract from the release package
		downloadArtifactsInput := operation.DownloadArtifactsInput{
			Organization:        contractsGithubOrganization,
			Repository:          contractsGithubRepository,
			Release:             contractsGithubReleasePrefix + in.ContractsVersionSha,
			Asset:               contractsGithubAssetPrefix + in.ContractsVersionSha,
			FilesSuffixToFilter: contractsFileNameSuffix,
		}
		downloadArtifactsOutput, err := operations.ExecuteOperation(b, operation.DownloadArtifactsOp, deps, downloadArtifactsInput)

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

	output.CompiledContracts = make(map[ds.ContractType]CompiledContractData)
	for _, contractType := range contractToLookFor {
		contractMetadata, ok := contractsMapping[contractType]

		if !ok {
			return output, fmt.Errorf("unknown contractType: %s", contractType)
		}

		contractCode, err := wrappers.ParseCompiledContract(helpers.GetBuildDir(b.GetContext(), contractMetadata.CompiledVersionKey))
		if err != nil {
			return output, fmt.Errorf("failed to compile %s contractType: %w", contractType, err)
		}

		output.CompiledContracts[contractType] = CompiledContractData{
			Code:                           contractCode,
			SuggestedTONCoinsForDeployment: contractMetadata.SuggestedTONCoinsForDeployment,
			ContractVersionSha:             in.ContractsVersionSha,
			ContractSemver:                 in.ContractsSemver,
			Type:                           contractType,
		}
	}

	return output, nil
}
