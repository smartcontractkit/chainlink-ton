package sequence

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"

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

	tonContractAddress, err := utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, routerAddress, tonCompiledContracts[state.Router], routerStorage, nil)
	if err != nil {
		return output, err
	} else if tonContractAddress != nil {
		routerAddress = tonContractAddress.TONAddress
		output.RouterAddress = tonContractAddress
	}

	// FeeQuoter
	linkTokenAddress := deps.CCIPOnChainState[in.ChainSelector].LinkTokenAddress
	if linkTokenAddress.IsAddrNone() {
		return output, errors.New("LINK address cannot be zero")
	}
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

	tonContractAddress, err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, feeQuoterAddress, tonCompiledContracts[state.FeeQuoter], feeQuoterStorage, nil)
	if err != nil {
		return output, err
	} else if tonContractAddress != nil {
		feeQuoterAddress = tonContractAddress.TONAddress
		output.FeeQuoterAddress = tonContractAddress
	}

	// OnRamp
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

	tonContractAddress, err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, deps.CCIPOnChainState[in.ChainSelector].OnRamp, tonCompiledContracts[state.OnRamp], onRampStorage, nil)
	if err != nil {
		return output, err
	} else if tonContractAddress != nil {
		output.OnRampAddress = tonContractAddress
	}

	// OffRamp
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
		OCR3Base:                                offramp.OCR3Base{},
		ChainSelector:                           in.ChainSelector,
		PermissionlessExecutionThresholdSeconds: in.CCIPConfig.OffRampParams.PermissionlessExecutionThreshold, SourceChainConfigs: nil,
		LatestPriceSequenceNumber: 0,
	}

	tonContractAddress, err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, deps.CCIPOnChainState[in.ChainSelector].OffRamp, tonCompiledContracts[state.OffRamp], offRampStorage, nil)
	if err != nil {
		return output, err
	} else if tonContractAddress != nil {
		output.OffRampAddress = tonContractAddress
	}

	// Receiver
	receiverStorage := receiver.Storage{
		ID: in.CCIPConfig.ReceiverParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		AuthorizedCaller: &routerAddress,
		Behavior:         receiver.Accept,
	}

	tonContractAddress, err = utils.InvokeDeployContractOperation(b, deps, in.ChainSelector, deps.CCIPOnChainState[in.ChainSelector].ReceiverAddress, tonCompiledContracts[state.TonReceiver], receiverStorage, nil)
	if err != nil {
		return output, err
	} else if tonContractAddress != nil {
		output.ReceiverAddress = tonContractAddress
	}

	// Invoke deploy Timelock changeset operation
	deployTimelockInput := mcmsOps.DeployTimelockInput{
		ContractPath: tonCompiledContracts[state.Timelock].ContractPath,
		ID:           in.CCIPConfig.TimelockParams.ID,
		Coins:        tonCompiledContracts[state.Timelock].SuggestedTONCoinsForDeployment,
		MinDelay:     in.CCIPConfig.TimelockParams.MinDelay,
		Admin:        in.CCIPConfig.TimelockParams.Admin,
		Proposers:    in.CCIPConfig.TimelockParams.Proposers,
		Executors:    in.CCIPConfig.TimelockParams.Executors,
		Cancellers:   in.CCIPConfig.TimelockParams.Cancellers,
		Bypassers:    in.CCIPConfig.TimelockParams.Bypassers,
	}

	deployTimelockOutput, err := operations.ExecuteOperation(b, mcmsOps.DeployTimelockOp, deps, deployTimelockInput)
	if err != nil {
		return output, err
	} else if deployTimelockOutput.Output != nil {
		output.TimelockAddress = newTONContractAddress(*deployTimelockOutput.Output, in.ChainSelector, state.Timelock, in.ContractsSemver, in.ContractsVersionSha)
	}

	// Invoke deploy MCMS changeset operation
	deployMCMSInput := mcmsOps.DeployMCMSInput{
		ContractPath: tonCompiledContracts[state.MCMS].ContractPath,
		ID:           in.CCIPConfig.MCMSParams.ID,
		Coins:        tonCompiledContracts[state.MCMS].SuggestedTONCoinsForDeployment,
	}

	deployMCMSOutput, err := operations.ExecuteOperation(b, mcmsOps.DeployMCMSOp, deps, deployMCMSInput)
	if err != nil {
		return output, err
	} else if deployMCMSOutput.Output != nil {
		output.MCMSAddress = newTONContractAddress(*deployMCMSOutput.Output, in.ChainSelector, state.MCMS, in.ContractsSemver, in.ContractsVersionSha)
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
