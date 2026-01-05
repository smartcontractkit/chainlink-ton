package sequence

import (
	"math/big"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/config"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"

	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
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

var DeployCCIPSequence = operations.NewSequence(
	"ton-deploy-ccip-seq",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial CCIP configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, deps ccipConfig.CCIPDeps, in DeployCCIPSeqInput) (sequences.OnChainOutput, error) {
	// TODO: don't directly execute deployments, instead return them as txs
	addresses := make([]datastore.AddressRef, 0)
	retrieveContractsInput := sequence.RetrieveCompiledContractsSeqInput{
		ContractsVersionSha: in.ContractsVersionSha,
		Contracts: []datastore.ContractType{
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
		return sequences.OnChainOutput{}, err
	}

	tonCompiledContracts := tonCompiledContractsSeqOutput.Output.CompiledContracts

	tonDeps := config.TonDeps{
		TonChain: deps.TonChain,
	}

	var outputAddr *datastore.AddressRef
	// Router

	routerAddress := deps.CCIPOnChainState[in.ChainSelector].Router
	if routerAddress.IsAddrNone() {
		routerStorage := router.Storage{
			ID: in.CCIPConfig.RouterParams.ID,
			Ownable: ownable2step.Storage{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			WrappedNative: tvm.TonTokenAddr,
			RMNRemote: router.RMNRemote{
				Admin: ownable2step.Storage{
					Owner:        deps.TonChain.WalletAddress,
					PendingOwner: address.NewAddressNone(),
				},
				CursedSubjects: nil,
				ForwardUpdates: nil,
			},
			OnRamps: nil, // set afterward
		}

		outputAddr, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.Router], routerStorage, nil, in.CCIPConfig.RouterParams.Coin, in.CCIPConfig.RouterParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		addresses = append(addresses, *outputAddr)
		routerAddress = *address.MustParseAddr(outputAddr.Address)
	}

	// FeeQuoter
	linkTokenAddress := deps.CCIPOnChainState[in.ChainSelector].LinkTokenAddress
	if linkTokenAddress.IsAddrNone() {
		// TODO: create a constant in tvm package for the default LINK token address (NONEVM-1651)
		linkTokenAddress = *address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")
		addresses = append(addresses, datastore.AddressRef{
			Address:       linkTokenAddress.String(),
			ChainSelector: in.ChainSelector,
			Labels:        datastore.LabelSet{},
			Type:          state.LinkToken,
			Version:       &state.Version1_6_0,
		})
	}

	feeQuoterAddress := deps.CCIPOnChainState[in.ChainSelector].FeeQuoter
	if feeQuoterAddress.IsAddrNone() {
		feeQuoterStorage := feequoter.Storage{
			ID: in.CCIPConfig.FeeQuoterParams.ID,
			Ownable: ownable2step.Storage{
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
		outputAddr, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.FeeQuoter], feeQuoterStorage, nil, in.CCIPConfig.FeeQuoterParams.Coin, in.CCIPConfig.FeeQuoterParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
		feeQuoterAddress = *address.MustParseAddr(outputAddr.Address)
	}

	reserve, err := tlb.FromTON(in.CCIPConfig.OnRampParams.Reserve)
	if err != nil {
		return sequences.OnChainOutput{}, err
	}

	// OnRamp (has to be deployed after FeeQuoter to have feeQuoter address ready)
	onRampAddr := deps.CCIPOnChainState[in.ChainSelector].OnRamp
	if onRampAddr.IsAddrNone() {
		onRampStorage := onramp.Storage{
			ID: in.CCIPConfig.OnRampParams.ID,
			Ownable: ownable2step.Storage{
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

		outputAddr, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.OnRamp], onRampStorage, nil, in.CCIPConfig.OnRampParams.Coin, in.CCIPConfig.OnRampParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		addresses = append(addresses, *outputAddr)
		onRampAddr = *address.MustParseAddr(outputAddr.Address)
	}

	// OffRamp (has to be deployed after FeeQuoter and Router to have their addresses ready)
	offRampAddr := deps.CCIPOnChainState[in.ChainSelector].OffRamp
	if offRampAddr.IsAddrNone() {
		offRampStorage := offramp.Storage{
			ID: in.CCIPConfig.OffRampParams.ID,
			Ownable: ownable2step.Storage{
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

		outputAddr, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.OffRamp], offRampStorage, nil, in.CCIPConfig.OffRampParams.Coin, in.CCIPConfig.OffRampParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
		offRampAddr = *address.MustParseAddr(outputAddr.Address)
	}

	// Receiver (has to be deployed after Router to have its address ready)
	receiverAddress := deps.CCIPOnChainState[in.ChainSelector].ReceiverAddress
	if receiverAddress.IsAddrNone() {
		receiverStorage := receiver.Storage{
			ID: in.CCIPConfig.ReceiverParams.ID,
			Ownable: ownable2step.Storage{
				Owner:        deps.TonChain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			AuthorizedCaller: &routerAddress,
			Behavior:         receiver.Accept,
		}

		outputAddr, err = utils.InvokeDeployContractOperation(b, tonDeps, in.ChainSelector, tonCompiledContracts[state.TonReceiver], receiverStorage, nil, in.CCIPConfig.ReceiverParams.Coin, in.CCIPConfig.ReceiverParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
	}

	return sequences.OnChainOutput{
		Addresses: addresses,
	}, nil
}
