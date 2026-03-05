package sequence

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

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
func retrieveCompiledTONContractsSequence(b operations.Bundle, dp *dep.DependencyProvider, in utils.RetrieveCompiledContractsInput) (utils.RetrieveCompiledContractsOutput, error) {
	output, err := utils.RetrieveCompiledTONContracts(b.GetContext(), b.Logger, in)
	if err != nil {
		return utils.RetrieveCompiledContractsOutput{}, fmt.Errorf("failed to retrieve compiled TON contracts: %w", err)
	}
	return output, nil
}
