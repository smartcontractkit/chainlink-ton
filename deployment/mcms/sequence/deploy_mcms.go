package sequence

import (
	"fmt"
	"strconv"

	"github.com/Masterminds/semver/v3"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	mcmsConfig "github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
)

type DeployMCMSSeqInput struct {
	ContractsVersionSha string
	ContractsParams     mcmsConfig.ChainContractParams
	ChainSelector       uint64
}

var DeployMCMSSequence = cldf_ops.NewSequence(
	"ton/sequences/mcms/deploy-mcms-suite",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial MCMS configuration",
	deployMCMSSequence,
)

func deployMCMSSequence(b cldf_ops.Bundle, dp *dep.DependencyProvider, in DeployMCMSSeqInput) (sequences.OnChainOutput, error) {
	chain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return sequences.OnChainOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
	}

	stateMCMS, err := dep.Resolve[state.MCMSChainState](dp)
	if err != nil {
		return sequences.OnChainOutput{}, fmt.Errorf("failed to resolve ton mcms state: %w", err)
	}

	addresses := make([]ds.AddressRef, 0)

	retrieveContractsInput := sequence.RetrieveCompiledContractsSeqInput{
		ContractsVersionSha: in.ContractsVersionSha,
		Contracts: []ds.ContractType{
			state.Timelock,
			state.MCMS,
		},
	}

	tonCompiledContractsSeqOutput, err := cldf_ops.ExecuteSequence(b, sequence.RetrieveContractsSequence, dp, retrieveContractsInput)
	if err != nil {
		return sequences.OnChainOutput{}, err
	}

	tonCompiledContracts := tonCompiledContractsSeqOutput.Output.CompiledContracts
	var outputAddr *ds.AddressRef

	// Invoke deploy Timelock changeset operation
	if stateMCMS.Timelock.IsAddrNone() { // Deploy Timelock only if not deployed yet
		storage := timelock.EmptyDataFrom(in.ContractsParams.Timelock.ID)
		body := in.ContractsParams.Timelock.InitMessage

		outputAddr, err = utils.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[state.Timelock], storage, body, in.ContractsParams.Timelock.Coin, in.ContractsParams.Timelock.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
	}

	// Invoke deploy MCMS changeset operation
	if stateMCMS.MCMS.IsAddrNone() { // Deploy MCMS only if not deployed yet
		var chainIDStr string
		chainSelector := chain.ChainSelector()
		chainIDStr, err = chainsel.GetChainIDFromSelector(chainSelector)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to get chainID from selector %d: %w", chainSelector, err)
		}

		chainIDInt, err := strconv.ParseInt(chainIDStr, 10, 64)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("invalid ChainID: %w", err)
		}

		initStorage := mcms.EmptyDataFrom(in.ContractsParams.MCMS.ID, chain.WalletAddress, chainIDInt)
		outputAddr, err = utils.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[state.MCMS], initStorage, nil, in.ContractsParams.MCMS.Coin, in.ContractsParams.MCMS.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
	}

	return sequences.OnChainOutput{
		Addresses: addresses,
	}, nil
}
