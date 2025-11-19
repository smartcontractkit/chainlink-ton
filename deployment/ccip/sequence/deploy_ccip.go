package sequence

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	mcmsOps "github.com/smartcontractkit/chainlink-ton/deployment/mcms/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
)

type DeployCCIPSeqInput struct {
	ContractsVersionSha string
	ContractsSemver     *semver.Version
	CCIPConfig          config.ChainContractParams
	ChainSelector       uint64
}

type DeployCCIPSeqOutput struct {
	RouterAddress    *utils.TONContractAddress
	FeeQuoterAddress *utils.TONContractAddress
	OnRampAddress    *utils.TONContractAddress
	OffRampAddress   *utils.TONContractAddress
	ReceiverAddress  *utils.TONContractAddress
	TimelockAddress  *utils.TONContractAddress
	MCMSAddress      *utils.TONContractAddress
	Transactions     [][]byte
}

var DeployCCIPSequence = operations.NewSequence(
	"ton-deploy-ccip-seq",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial CCIP configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, deps operation.TonDeps, in DeployCCIPSeqInput) (DeployCCIPSeqOutput, error) {
	// TODO: don't directly execute deployments, instead return them as txs

	// Initialize the output
	output := DeployCCIPSeqOutput{}

	retrieveContractsInput := sequence.RetrieveCompiledContractsSeqInput{
		ContractsSemver:     in.ContractsSemver,
		ContractsVersionSha: in.ContractsVersionSha,
		Contracts: []ds.ContractType{
			state.Router,
			state.FeeQuoter,
			state.OffRamp,
			state.OnRamp,
			state.TonReceiver,
			state.Timelock,
			state.SendExecutor,
			state.Deployer,
			state.MerkleRoot,
			state.ReceiveExecutor,
			state.MCMS,
		},
	}

	tonCompiledContractsSeqOutput, err := operations.ExecuteSequence(b, sequence.RetrieveContractsSequence, deps, retrieveContractsInput)
	if err != nil {
		return output, err
	}

	tonCompiledContracts := tonCompiledContractsSeqOutput.Output.CompiledContracts

	// Router
	routerAddress := deps.CCIPOnChainState[in.ChainSelector].Router
	routerStorage := router.Storage{
		ID: in.CCIPConfig.RouterParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		WrappedNative: tvm.TonTokenAddr,
		RMNRemote: router.RMNRemote{
			Admin: common.Ownable2Step{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: nil,
			},
			CursedSubjects: nil,
			ForwardUpdates: nil,
		},
		OnRamps: nil, // set afterward
	}

	err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, routerAddress, tonCompiledContracts[state.Router], routerStorage, nil, func(tonContractAddress *utils.TONContractAddress) {
		routerAddress = tonContractAddress.TONAddress
		output.RouterAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// FeeQuoter
	linkTokenAddress := deps.CCIPOnChainState[in.ChainSelector].LinkTokenAddress
	feeQuoterAddress := deps.CCIPOnChainState[in.ChainSelector].FeeQuoter
	feeQuoterStorage := feequoter.Storage{
		ID: in.CCIPConfig.FeeQuoterParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		MaxFeeJuelsPerMsg:            in.CCIPConfig.FeeQuoterParams.MaxFeeJuelsPerMsg,
		LinkToken:                    &linkTokenAddress,
		TokenPriceStalenessThreshold: in.CCIPConfig.FeeQuoterParams.TokenPriceStalenessThreshold,
		UsdPerToken:                  nil,
		PremiumMultiplierWeiPerEth:   nil,
		DestChainConfigs:             nil,
	}

	err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, feeQuoterAddress, tonCompiledContracts[state.FeeQuoter], feeQuoterStorage, nil, func(tonContractAddress *utils.TONContractAddress) {
		feeQuoterAddress = tonContractAddress.TONAddress
		output.FeeQuoterAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// OnRamp
	onRampAddress := deps.CCIPOnChainState[in.ChainSelector].OnRamp
	onRampStorage := onramp.Storage{
		ID: in.CCIPConfig.OnRampParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		ChainSelector: in.ChainSelector,
		Config: onramp.DynamicConfig{
			FeeQuoter:      &feeQuoterAddress,
			FeeAggregator:  in.CCIPConfig.OnRampParams.FeeAggregator,
			AllowListAdmin: deps.TonChain.WalletAddress,
		},
		DestChainConfigs: nil,
		Executor: onramp.ExecutorDeployment{
			DeployableCode: tonCompiledContracts[state.Deployer].Code,
			ExecutorCode:   tonCompiledContracts[state.SendExecutor].Code,
			CurrentID:      big.NewInt(0),
		},
	}

	err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, onRampAddress, tonCompiledContracts[state.OnRamp], onRampStorage, nil, func(tonContractAddress *utils.TONContractAddress) {
		onRampAddress = tonContractAddress.TONAddress
		output.OnRampAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// OffRamp
	offRampAddress := deps.CCIPOnChainState[in.ChainSelector].OffRamp
	offRampStorage := offramp.Storage{
		ID: in.CCIPConfig.OffRampParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		Deployables: offramp.Deployables{
			RMNRouter:           &routerAddress,
			Deployer:            tonCompiledContracts[state.Deployer].Code,
			MerkleRootCode:      tonCompiledContracts[state.MerkleRoot].Code,
			ReceiveExecutorCode: tonCompiledContracts[state.ReceiveExecutor].Code,
		},
		FeeQuoter: &feeQuoterAddress,
		// empty OCR3Base
		OCR3Base: cell.BeginCell().
			MustStoreUInt(0, 8).
			MustStoreBoolBit(false).
			MustStoreBoolBit(false).
			EndCell(),
		ChainSelector:                           in.ChainSelector,
		PermissionlessExecutionThresholdSeconds: in.CCIPConfig.OffRampParams.PermissionlessExecutionThreshold, SourceChainConfigs: nil,
		LatestPriceSequenceNumber: 0,
	}

	err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, offRampAddress, tonCompiledContracts[state.OffRamp], offRampStorage, nil, func(tonContractAddress *utils.TONContractAddress) {
		offRampAddress = tonContractAddress.TONAddress
		output.OffRampAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// Receiver
	receiverAddress := deps.CCIPOnChainState[in.ChainSelector].ReceiverAddress
	receiverStorage := receiver.Storage{
		ID: in.CCIPConfig.ReceiverParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		AuthorizedCaller: &routerAddress,
		Behavior:         receiver.Accept,
	}

	err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, receiverAddress, tonCompiledContracts[state.TonReceiver], receiverStorage, nil, func(tonContractAddress *utils.TONContractAddress) {
		receiverAddress = tonContractAddress.TONAddress
		output.ReceiverAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// Invoke deploy Timelock changeset operation
	deployTimelockInput := mcmsOps.DeployTimelockInput{
		ContractPath:  tonCompiledContracts[state.Timelock].ContractPath,
		ID:            in.CCIPConfig.TimelockParams.ID,
		ChainSelector: in.ChainSelector,
		Coins:         tonCompiledContracts[state.Timelock].SuggestedTONCoinsForDeployment,
		MinDelay:      in.CCIPConfig.TimelockParams.MinDelay,
		Admin:         in.CCIPConfig.TimelockParams.Admin,
		Proposers:     in.CCIPConfig.TimelockParams.Proposers,
		Executors:     in.CCIPConfig.TimelockParams.Executors,
		Cancellers:    in.CCIPConfig.TimelockParams.Cancellers,
		Bypassers:     in.CCIPConfig.TimelockParams.Bypassers,
	}

	deployTimelockOutput, err := operations.ExecuteOperation(b, mcmsOps.DeployTimelockOp, deps, deployTimelockInput)
	if err != nil {
		return output, err
	} else if !deployTimelockOutput.Output.Address.IsAddrNone() {
		output.TimelockAddress = newTONContractAddress(deployTimelockOutput.Output.Address, in.ChainSelector, state.Timelock, in.ContractsSemver, in.ContractsVersionSha)
	}

	// Invoke deploy MCMS changeset operation
	deployMCMSInput := mcmsOps.DeployMCMSInput{
		ContractPath:  tonCompiledContracts[state.MCMS].ContractPath,
		ID:            in.CCIPConfig.MCMSParams.ID,
		ChainSelector: in.ChainSelector,
		Coins:         tonCompiledContracts[state.MCMS].SuggestedTONCoinsForDeployment,
		OpsCount:      in.CCIPConfig.MCMSParams.OpsCount,
		ChainID:       in.CCIPConfig.MCMSParams.ChainID,
		PreOpsCount:   in.CCIPConfig.MCMSParams.PreOpsCount,
		PostOpsCount:  in.CCIPConfig.MCMSParams.PostOpsCount,
	}

	deployMCMSOutput, err := operations.ExecuteOperation(b, mcmsOps.DeployMCMSOp, deps, deployMCMSInput)
	if err != nil {
		return output, err
	} else if !deployMCMSOutput.Output.Address.IsAddrNone() {
		output.MCMSAddress = newTONContractAddress(deployMCMSOutput.Output.Address, in.ChainSelector, state.MCMS, in.ContractsSemver, in.ContractsVersionSha)
	}

	return output, nil
}

func newTONContractAddress(addr address.Address, chainSelector uint64, contractType ds.ContractType, version *semver.Version, sha string) *utils.TONContractAddress {
	return &utils.TONContractAddress{
		TONAddress: addr,
		CLDFAddressRef: ds.AddressRef{
			Address:       addr.String(),
			ChainSelector: chainSelector,
			Type:          contractType,
			Version:       version,
			Labels:        ds.NewLabelSet("sha:" + sha),
		},
	}
}
