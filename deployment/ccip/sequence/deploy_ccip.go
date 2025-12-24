package sequence

import (
	"errors"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/config"

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

	ccipConfig "github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
)

type DeployCCIPSeqInput struct {
	ContractsVersionSha string
	CCIPConfig          ccipConfig.ChainContractParams
	ChainSelector       uint64
}

type DeployCCIPSeqOutput struct {
	RouterAddress    *utils.TONContractAddress
	FeeQuoterAddress *utils.TONContractAddress
	OnRampAddress    *utils.TONContractAddress
	OffRampAddress   *utils.TONContractAddress
	ReceiverAddress  *utils.TONContractAddress
	Transactions     [][]byte
}

var DeployCCIPSequence = operations.NewSequence(
	"ton-deploy-ccip-seq",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial CCIP configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, deps ccipConfig.CCIPDeps, in DeployCCIPSeqInput) (DeployCCIPSeqOutput, error) {
	// TODO: don't directly execute deployments, instead return them as txs

	// Initialize the output
	output := DeployCCIPSeqOutput{}

	retrieveContractsInput := sequence.RetrieveCompiledContractsSeqInput{
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

	tonCompiledContractsSeqOutput, err := operations.ExecuteSequence(b, sequence.RetrieveContractsSequence, config.TonDeps{TonChain: deps.TonChain}, retrieveContractsInput)
	if err != nil {
		return output, err
	}

	tonCompiledContracts := tonCompiledContractsSeqOutput.Output.CompiledContracts

	tonDeps := config.TonDeps{
		TonChain: deps.TonChain,
	}

	var tonContractAddress *utils.TONContractAddress
	// Router

	routerAddress := deps.CCIPOnChainState[in.ChainSelector].Router
	if routerAddress.IsAddrNone() {
		routerStorage := router.Storage{
			ID: in.CCIPConfig.RouterParams.ID,
			Ownable: common.Ownable2Step{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			WrappedNative: tvm.TonTokenAddr,
			RMNRemote: router.RMNRemote{
				Admin: common.Ownable2Step{
					Owner:        deps.TonChain.WalletAddress,
					PendingOwner: address.NewAddressNone(),
				},
				CursedSubjects: nil,
				ForwardUpdates: nil,
			},
			OnRamps: nil, // set afterward
		}

		tonContractAddress, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.Router], routerStorage, nil, in.CCIPConfig.RouterParams.Coin, in.CCIPConfig.RouterParams.ContractsSemver)
		if err != nil {
			return output, err
		}
		routerAddress = tonContractAddress.TONAddress
		output.RouterAddress = tonContractAddress
	}

	// FeeQuoter
	linkTokenAddress := deps.CCIPOnChainState[in.ChainSelector].LinkTokenAddress
	if linkTokenAddress.IsAddrNone() {
		return output, errors.New("LINK address cannot be zero")
	}

	feeQuoterAddress := deps.CCIPOnChainState[in.ChainSelector].FeeQuoter
	if feeQuoterAddress.IsAddrNone() {
		feeQuoterStorage := feequoter.Storage{
			ID: in.CCIPConfig.FeeQuoterParams.ID,
			Ownable: common.Ownable2Step{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			MaxFeeJuelsPerMsg:            in.CCIPConfig.FeeQuoterParams.MaxFeeJuelsPerMsg,
			LinkToken:                    &linkTokenAddress,
			TokenPriceStalenessThreshold: in.CCIPConfig.FeeQuoterParams.TokenPriceStalenessThreshold,
			UsdPerToken:                  nil,
			PremiumMultiplierWeiPerEth:   nil,
			DestChainConfigs:             nil,
		}

		// TODO: handle setting FeeTokens and PremiumMultiplierWeiPerEthByFeeToken
		tonContractAddress, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.FeeQuoter], feeQuoterStorage, nil, in.CCIPConfig.FeeQuoterParams.Coin, in.CCIPConfig.FeeQuoterParams.ContractsSemver)
		if err != nil {
			return output, err
		}
		feeQuoterAddress = tonContractAddress.TONAddress
		output.FeeQuoterAddress = tonContractAddress
	}

	reserve, err := tlb.FromTON(in.CCIPConfig.OnRampParams.Reserve)
	if err != nil {
		return output, err
	}

	// OnRamp (has to be deployed after FeeQuoter to have feeQuoter address ready)
	onRampAddr := deps.CCIPOnChainState[in.ChainSelector].OnRamp
	if onRampAddr.IsAddrNone() {
		onRampStorage := onramp.Storage{
			ID: in.CCIPConfig.OnRampParams.ID,
			Ownable: common.Ownable2Step{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			ChainSelector: in.ChainSelector,
			Config: onramp.DynamicConfig{
				FeeQuoter:      &feeQuoterAddress,
				FeeAggregator:  in.CCIPConfig.OnRampParams.FeeAggregator,
				AllowListAdmin: deps.TonChain.WalletAddress,
				Reserve:        reserve,
			},
			DestChainConfigs: nil,
			Executor: onramp.ExecutorDeployment{
				DeployableCode: tonCompiledContracts[state.Deployer].Code,
				ExecutorCode:   tonCompiledContracts[state.SendExecutor].Code,
				CurrentID:      big.NewInt(0),
			},
		}

		tonContractAddress, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.OnRamp], onRampStorage, nil, in.CCIPConfig.OnRampParams.Coin, in.CCIPConfig.OnRampParams.ContractsSemver)
		if err != nil {
			return output, err
		}

		onRampAddr = tonContractAddress.TONAddress
		output.OnRampAddress = tonContractAddress
	}

	// OffRamp (has to be deployed after FeeQuoter and Router to have their addresses ready)
	offRampAddr := deps.CCIPOnChainState[in.ChainSelector].OffRamp
	if offRampAddr.IsAddrNone() {
		offRampStorage := offramp.Storage{
			ID: in.CCIPConfig.OffRampParams.ID,
			Ownable: common.Ownable2Step{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
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

		tonContractAddress, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.OffRamp], offRampStorage, nil, in.CCIPConfig.OffRampParams.Coin, in.CCIPConfig.OffRampParams.ContractsSemver)
		if err != nil {
			return output, err
		}
		offRampAddr = tonContractAddress.TONAddress
		output.OffRampAddress = tonContractAddress
	}

	// Receiver (has to be deployed after Router to have its address ready)
	receiverAddress := deps.CCIPOnChainState[in.ChainSelector].ReceiverAddress
	if receiverAddress.IsAddrNone() {
		receiverStorage := receiver.Storage{
			ID: in.CCIPConfig.ReceiverParams.ID,
			Ownable: common.Ownable2Step{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			AuthorizedCaller: &routerAddress,
			Behavior:         receiver.Accept,
		}

		tonContractAddress, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.TonReceiver], receiverStorage, nil, in.CCIPConfig.ReceiverParams.Coin, in.CCIPConfig.ReceiverParams.ContractsSemver)
		if err != nil {
			return output, err
		}
		receiverAddress = tonContractAddress.TONAddress
		output.ReceiverAddress = tonContractAddress
	}

	return output, nil
}
