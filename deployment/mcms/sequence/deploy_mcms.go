package sequence

import (
	"fmt"
	"strconv"

	"github.com/Masterminds/semver/v3"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/config"
	mcmsConfig "github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type DeployMCMSSeqInput struct {
	ContractsVersionSha string
	ContractsParams     mcmsConfig.ChainContractParams
	ChainSelector       uint64
}

var DeployMCMSSequence = operations.NewSequence(
	"ton-deploy-mcms-seq",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial MCMS configuration",
	deployMCMSSequence,
)

func deployMCMSSequence(b operations.Bundle, deps mcmsConfig.MCMSDeps, in DeployMCMSSeqInput) (sequences.OnChainOutput, error) {
	addresses := make([]ds.AddressRef, 0)

	retrieveContractsInput := sequence.RetrieveCompiledContractsSeqInput{
		ContractsVersionSha: in.ContractsVersionSha,
		Contracts: []ds.ContractType{
			state.Timelock,
			state.MCMS,
		},
	}

	tonCompiledContractsSeqOutput, err := operations.ExecuteSequence(b, sequence.RetrieveContractsSequence, config.TonDeps{TonChain: deps.TonChain}, retrieveContractsInput)
	if err != nil {
		return sequences.OnChainOutput{}, err
	}

	tonCompiledContracts := tonCompiledContractsSeqOutput.Output.CompiledContracts
	var outputAddr *ds.AddressRef

	// Invoke deploy Timelock changeset operation
	a := deps.MCMSChainState[in.ChainSelector].Timelock
	if a.IsAddrNone() { // Deploy Timelock only if not deployed yet
		storage := timelock.EmptyDataFrom(in.ContractsParams.Timelock.ID)
		storage.MinDelay = in.ContractsParams.Timelock.MinDelay

		body := timelock.Init{
			QueryID:                  0,
			MinDelay:                 in.ContractsParams.Timelock.MinDelay,
			Admin:                    in.ContractsParams.Timelock.Admin,
			Proposers:                common.SnakeData[common.AddressWrap](common.WrapAddresses(in.ContractsParams.Timelock.Proposers)),
			Executors:                common.SnakeData[common.AddressWrap](common.WrapAddresses(in.ContractsParams.Timelock.Executors)),
			Cancellers:               common.SnakeData[common.AddressWrap](common.WrapAddresses(in.ContractsParams.Timelock.Cancellers)),
			Bypassers:                common.SnakeData[common.AddressWrap](common.WrapAddresses(in.ContractsParams.Timelock.Bypassers)),
			ExecutorRoleCheckEnabled: true,
			OpFinalizationTimeout:    0,
		}

		outputAddr, err = utils.InvokeDeployContractOperation(b, config.TonDeps{TonChain: deps.TonChain}, in.ChainSelector, tonCompiledContracts[state.Timelock], storage, body, in.ContractsParams.Timelock.Coin, in.ContractsParams.Timelock.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
	}

	// Invoke deploy MCMS changeset operation
	a = deps.MCMSChainState[in.ChainSelector].MCMS
	if a.IsAddrNone() { // Deploy MCMS only if not deployed yet
		var chainIDStr string
		chainSelector := deps.TonChain.ChainSelector()
		chainIDStr, err = chainsel.GetChainIDFromSelector(chainSelector)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to get chainID from selector %d: %w", chainSelector, err)
		}

		chainIDInt, err := strconv.ParseInt(chainIDStr, 10, 64)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("invalid ChainID: %w", err)
		}

		initStorage := mcms.EmptyDataFrom(in.ContractsParams.MCMS.ID, deps.TonChain.WalletAddress, chainIDInt)
		outputAddr, err = utils.InvokeDeployContractOperation(b, config.TonDeps{TonChain: deps.TonChain}, in.ChainSelector, tonCompiledContracts[state.MCMS], initStorage, nil, in.ContractsParams.MCMS.Coin, in.ContractsParams.MCMS.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
	}

	return sequences.OnChainOutput{
		Addresses: addresses,
	}, nil
}
