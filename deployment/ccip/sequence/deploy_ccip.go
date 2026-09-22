package sequence

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	ccipConfig "github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenadminregistry"
)

type DeployCCIPSeqInput struct {
	ContractsPackageRef string
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

	// Notice: we set a (static) default when version is not provided
	contractsPackage := utils.ContractsPackageLatestSupported
	if in.ContractsPackageRef != "" {
		contractsPackage = in.ContractsPackageRef
		b.Logger.Infof("Will try to fetch contracts package from package ref: %s", contractsPackage)
	}

	// TODO: don't directly execute deployments, instead return them as txs
	addresses := make([]datastore.AddressRef, 0)

	// Fetch the contract code using the Fully Qualified Name of the contracts instead of the types used in the datastore
	retrieveContractsOpts := utils.RetrieveCompiledContractsOpts{
		Package: contractsPackage,
		Contracts: []tvm.FullyQualifiedName{
			bindings.TypeRouter,
			bindings.TypeFeeQuoter,
			bindings.TypeOffRamp,
			bindings.TypeOnRamp,
			bindings.TypeTokenAdminRegistry,
			bindings.TypeTokenAdminRegistryEntry,
			bindings.TypeTestReceiver,
			bindings.TypeTimelock,
			bindings.TypeSendExecutor,
			bindings.TypeDeployable,
			bindings.TypeMerkleRoot,
			bindings.TypeReceiveExecutor,
			bindings.TypeMCMS,
		},
	}

	tonCompiledContracts, err := utils.RetrieveCompiledTONContracts(b.GetContext(), b.Logger, &retrieveContractsOpts)
	if err != nil {
		return sequences.OnChainOutput{}, err
	}

	var outputAddr *datastore.AddressRef
	// Router

	routerAddress := stateCCIP.Router
	if routerAddress.IsAddrNone() {
		rbac, err := rmnAccessControl(chain.WalletAddress)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
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
				RBAC:           rbac,
				CursedSubjects: nil,
				ForwardUpdates: nil,
			},
			OnRamps:  nil, // set afterward
			OffRamps: nil, // set afterward
		}

		outputAddr, err = operation.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[bindings.TypeRouter], routerStorage, nil, in.CCIPConfig.RouterParams.Coin)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		addresses = append(addresses, *outputAddr)
		routerAddress = *address.MustParseAddr(outputAddr.Address)
	}

	// TokenAdminRegistry must be available before both ramps are deployed: each
	// derives the same deterministic TokenAdminRegistryEntry address from it.
	tokenAdminRegistryAddress := stateCCIP.TokenAdminRegistry
	if tokenAdminRegistryAddress.IsAddrNone() {
		registryStorage := tokenadminregistry.Storage{
			ID: in.CCIPConfig.TokenAdminRegistryParams.ID,
			Ownable: ownable2step.Storage{
				Owner: chain.WalletAddress, PendingOwner: address.NewAddressNone(),
			},
		}
		outputAddr, err = operation.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[bindings.TypeTokenAdminRegistry], registryStorage, nil, in.CCIPConfig.TokenAdminRegistryParams.Coin)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("deploy TokenAdminRegistry: %w", err)
		}
		addresses = append(addresses, *outputAddr)
		tokenAdminRegistryAddress = *address.MustParseAddr(outputAddr.Address)
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

	tonNativeTokenAddress := stateCCIP.TONNativeAddress
	if tonNativeTokenAddress.IsAddrNone() {
		tonNativeTokenAddress = *tvm.TonTokenAddr
		addresses = append(addresses, datastore.AddressRef{
			Address:       tonNativeTokenAddress.String(),
			ChainSelector: in.ChainSelector,
			Labels:        datastore.LabelSet{},
			Type:          state.TONNative,
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
		outputAddr, err = operation.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[bindings.TypeFeeQuoter], feeQuoterStorage, nil, in.CCIPConfig.FeeQuoterParams.Coin)
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
			StaticConfig: onramp.StaticConfig{
				ChainSelector:      in.ChainSelector,
				TokenAdminRegistry: &tokenAdminRegistryAddress,
			},
			Config: onramp.DynamicConfig{
				FeeQuoter:      &feeQuoterAddress,
				FeeAggregator:  in.CCIPConfig.OnRampParams.FeeAggregator,
				AllowListAdmin: chain.WalletAddress,
				Reserve:        reserve,
			},
			DestChainConfigs: nil,
		}

		outputAddr, err = operation.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[bindings.TypeOnRamp], onRampStorage, nil, in.CCIPConfig.OnRampParams.Coin)
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
			StaticConfig: offramp.StaticConfig{
				RMNRouter:          &routerAddress,
				TokenAdminRegistry: &tokenAdminRegistryAddress,
				ChainSelector:      in.ChainSelector,
			},
			FeeQuoter: &feeQuoterAddress,
			// empty OCR3Base
			OCR3Base:                                offramp.OCR3Base{},
			PermissionlessExecutionThresholdSeconds: in.CCIPConfig.OffRampParams.PermissionlessExecutionThreshold, SourceChainConfigs: nil,
			LatestPriceSequenceNumber: 0,
		}

		outputAddr, err = operation.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[bindings.TypeOffRamp], offRampStorage, nil, in.CCIPConfig.OffRampParams.Coin)
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
			Behavior:         receiver.BehaviorAccept,
		}

		outputAddr, err = operation.InvokeDeployContractOperation(b, dp, in.ChainSelector, tonCompiledContracts[bindings.TypeTestReceiver], receiverStorage, nil, in.CCIPConfig.ReceiverParams.Coin)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
	}

	return sequences.OnChainOutput{
		Addresses: addresses,
	}, nil
}

func rmnAccessControl(admin *address.Address) (router.AccessControlData, error) {
	roles := cell.NewDict(256)
	for _, role := range []string{
		"0",
		"b3c5b7cb9096e539f419cdc795a52c8cbe8dfbc9e27f70077d0b9749efe27fc5", // CURSE_ROLE
		"19331e9591f40b6bd5c2716faeab95f6a63184877fab2619bf484155c597abf0", // UNCURSE_ROLE
	} {
		roleID, ok := new(big.Int).SetString(role, 16)
		if !ok {
			return router.AccessControlData{}, fmt.Errorf("parse RMN role %q", role)
		}
		members := cell.NewDict(267)
		if err := members.Set(cell.BeginCell().MustStoreAddr(admin).EndCell(), cell.BeginCell().MustStoreUInt(1, 1).EndCell()); err != nil {
			return router.AccessControlData{}, fmt.Errorf("encode RMN role member: %w", err)
		}
		roleData, err := tlb.ToCell(router.AccessControlRoleData{
			AdminRole:  big.NewInt(0),
			MembersLen: 1,
			HasRole:    members,
		})
		if err != nil {
			return router.AccessControlData{}, fmt.Errorf("encode RMN role data: %w", err)
		}
		// AccessControl_Data stores each role value as Cell<RoleData>, so the
		// dictionary value itself contains a reference to the serialized role.
		if err := roles.Set(cell.BeginCell().MustStoreBigUInt(roleID, 256).EndCell(), cell.BeginCell().MustStoreRef(roleData).EndCell()); err != nil {
			return router.AccessControlData{}, fmt.Errorf("encode RMN role: %w", err)
		}
	}
	return router.AccessControlData{Roles: roles}, nil
}
