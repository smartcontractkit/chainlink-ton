package sequence

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	ccipConfig "github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type DeployCCIPSeqInput struct {
	ContractsVersionSha string
	CCIPConfig          ccipConfig.ChainContractParams
	ChainSelector       uint64
}

var DeployCCIPSequence = operations.NewSequence(
	"ton/sequences/ccip/deploy-ccip-suite",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial CCIP configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, dp *dep.DependencyProvider, in DeployCCIPSeqInput) (sequences.OnChainOutput, error) {
	chain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return sequences.OnChainOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
	}

	stateCCIP, err := dep.Resolve[state.CCIPChainState](dp)
	if err != nil {
		return sequences.OnChainOutput{}, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

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

	tonCompiledContractsSeqOutput, err := operations.ExecuteSequence(b, sequence.RetrieveContractsSequence, dp, retrieveContractsInput)
	if err != nil {
		return sequences.OnChainOutput{}, err
	}

	tonCompiledContracts := tonCompiledContractsSeqOutput.Output.CompiledContracts

	var outputAddr *datastore.AddressRef
	// Router

	routerAddress := stateCCIP.Router
	if routerAddress.IsAddrNone() {
		routerStorage := router.Storage{
			ID: in.CCIPConfig.RouterParams.ID,
			Ownable: ownable2step.Storage{
				Owner:        chain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			WrappedNative: tvm.TonTokenAddr,
			RMNRemote: router.RMNRemote{
				Admin: ownable2step.Storage{
					Owner:        chain.WalletAddress,
					PendingOwner: address.NewAddressNone(),
				},
				CursedSubjects: nil,
				ForwardUpdates: nil,
			},
			OnRamps: nil, // set afterward
		}

		outputAddr, err = utils.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[state.Router], routerStorage, nil, in.CCIPConfig.RouterParams.Coin, in.CCIPConfig.RouterParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		addresses = append(addresses, *outputAddr)
		routerAddress = *address.MustParseAddr(outputAddr.Address)
	}

	// FeeQuoter
	linkTokenAddress := stateCCIP.LinkTokenAddress
	if linkTokenAddress.IsAddrNone() {
		linkTokenAddress = *tvm.LinkTokenAddr
		addresses = append(addresses, datastore.AddressRef{
			Address:       linkTokenAddress.String(),
			ChainSelector: in.ChainSelector,
			Labels:        datastore.LabelSet{},
			Type:          state.LinkToken,
			Version:       &state.Version1_6_0,
		})
	}

	feeQuoterAddress := stateCCIP.FeeQuoter
	if feeQuoterAddress.IsAddrNone() {
		feeQuoterStorage := feequoter.Storage{
			ID: in.CCIPConfig.FeeQuoterParams.ID,
			Ownable: ownable2step.Storage{
				Owner:        chain.WalletAddress,
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
		outputAddr, err = utils.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[state.FeeQuoter], feeQuoterStorage, nil, in.CCIPConfig.FeeQuoterParams.Coin, in.CCIPConfig.FeeQuoterParams.ContractsSemver)
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
	onRampAddr := stateCCIP.OnRamp
	if onRampAddr.IsAddrNone() {
		onRampStorage := onramp.Storage{
			ID: in.CCIPConfig.OnRampParams.ID,
			Ownable: ownable2step.Storage{
				Owner:        chain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			ChainSelector: in.ChainSelector,
			Config: onramp.DynamicConfig{
				FeeQuoter:      &feeQuoterAddress,
				FeeAggregator:  in.CCIPConfig.OnRampParams.FeeAggregator,
				AllowListAdmin: chain.WalletAddress,
				Reserve:        reserve,
			},
			DestChainConfigs: nil,
			Executor: onramp.ExecutorDeployment{
				DeployableCode: tonCompiledContracts[state.Deployer].Code,
				ExecutorCode:   tonCompiledContracts[state.SendExecutor].Code,
				CurrentID:      big.NewInt(0),
			},
		}

		outputAddr, err = utils.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[state.OnRamp], onRampStorage, nil, in.CCIPConfig.OnRampParams.Coin, in.CCIPConfig.OnRampParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		addresses = append(addresses, *outputAddr)
		onRampAddr = *address.MustParseAddr(outputAddr.Address)
	}

	// OffRamp (has to be deployed after FeeQuoter and Router to have their addresses ready)
	offRampAddr := stateCCIP.OffRamp
	if offRampAddr.IsAddrNone() {
		offRampStorage := offramp.Storage{
			ID: in.CCIPConfig.OffRampParams.ID,
			Ownable: ownable2step.Storage{
				Owner:        chain.WalletAddress,
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

		outputAddr, err = utils.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[state.OffRamp], offRampStorage, nil, in.CCIPConfig.OffRampParams.Coin, in.CCIPConfig.OffRampParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
		offRampAddr = *address.MustParseAddr(outputAddr.Address)
	}

	// Receiver (has to be deployed after Router to have its address ready)
	receiverAddress := stateCCIP.ReceiverAddress
	if receiverAddress.IsAddrNone() {
		receiverStorage := receiver.Storage{
			ID: in.CCIPConfig.ReceiverParams.ID,
			Ownable: ownable2step.Storage{
				Owner:        chain.WalletAddress,
				PendingOwner: address.NewAddressNone(),
			},
			AuthorizedCaller: &routerAddress,
			Behavior:         receiver.Accept,
		}

		outputAddr, err = utils.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[state.TonReceiver], receiverStorage, nil, in.CCIPConfig.ReceiverParams.Coin, in.CCIPConfig.ReceiverParams.ContractsSemver)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
	}

	return sequences.OnChainOutput{
		Addresses: addresses,
	}, nil
}
