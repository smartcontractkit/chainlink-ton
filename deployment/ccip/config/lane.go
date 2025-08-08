package config

import (
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/fee_quoter"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
)

type LaneConfig struct {
	Source     ChainDefinition
	Dest       ChainDefinition
	IsDisabled bool
}

// UpdateTonLanesConfig is a configuration struct for AddTonLanesChangeset
// Lanes accept different chain families
type UpdateTonLanesConfig struct {
	// EVMMCMSConfig defines the MCMS configuration for EVM chains.
	EVMMCMSConfig *proposalutils.TimelockConfig
	// MCMSConfig defines the MCMS configuration for Ton chains.
	TonMCMSConfig *proposalutils.TimelockConfig
	// Lanes describes the lanes that we want to create.
	Lanes []LaneConfig
	// TestRouter indicates if we want to enable these lanes on the test router.
	TestRouter bool
}

// ToEVMUpdateLanesConfig adapts the TON Add Lanes config to EVM Update Lanes Config
// It adapts all Ton <> EVM lanes to v1_6.UpdateBidirectionalLanesChangesetConfigs type to be used in UpdateLanesLogic "sequence"
func ToEVMUpdateLanesConfig(tonAddCfg UpdateTonLanesConfig) v1_6.UpdateBidirectionalLanesChangesetConfigs {
	onRampUpdatesByChain := make(map[uint64]map[uint64]v1_6.OnRampDestinationUpdate)
	offRampUpdatesByChain := make(map[uint64]map[uint64]v1_6.OffRampSourceUpdate)
	routerUpdatesByChain := make(map[uint64]v1_6.RouterUpdates)
	feeQuoterDestUpdatesByChain := make(map[uint64]map[uint64]fee_quoter.FeeQuoterDestChainConfig)
	feeQuoterPriceUpdatesByChain := make(map[uint64]v1_6.FeeQuoterPriceUpdatePerSource)

	for _, lane := range tonAddCfg.Lanes {
		if lane.Source.GetChainFamily() == chainsel.FamilyEVM {
			setEVMSourceUpdates(
				lane,
				onRampUpdatesByChain,
				routerUpdatesByChain,
				feeQuoterDestUpdatesByChain,
				feeQuoterPriceUpdatesByChain,
				tonAddCfg.TestRouter,
			)
		}
		if lane.Dest.GetChainFamily() == chainsel.FamilyEVM {
			setEVMDestUpdates(
				lane,
				routerUpdatesByChain,
				offRampUpdatesByChain,
				tonAddCfg.TestRouter,
			)
		}
	}

	routerMCMSConfig := tonAddCfg.EVMMCMSConfig
	if tonAddCfg.TestRouter {
		routerMCMSConfig = nil // Test router is never owned by MCMS
	}

	return v1_6.UpdateBidirectionalLanesChangesetConfigs{
		UpdateFeeQuoterDestsConfig: v1_6.UpdateFeeQuoterDestsConfig{
			MCMS:           tonAddCfg.EVMMCMSConfig,
			UpdatesByChain: feeQuoterDestUpdatesByChain,
		},
		UpdateFeeQuoterPricesConfig: v1_6.UpdateFeeQuoterPricesConfig{
			MCMS:          tonAddCfg.EVMMCMSConfig,
			PricesByChain: feeQuoterPriceUpdatesByChain,
		},
		UpdateOnRampDestsConfig: v1_6.UpdateOnRampDestsConfig{
			MCMS:           tonAddCfg.EVMMCMSConfig,
			UpdatesByChain: onRampUpdatesByChain,
		},
		UpdateOffRampSourcesConfig: v1_6.UpdateOffRampSourcesConfig{
			MCMS:           tonAddCfg.EVMMCMSConfig,
			UpdatesByChain: offRampUpdatesByChain,
		},
		UpdateRouterRampsConfig: v1_6.UpdateRouterRampsConfig{
			TestRouter:     tonAddCfg.TestRouter,
			MCMS:           routerMCMSConfig,
			UpdatesByChain: routerUpdatesByChain,
		},
	}
}

// setEVMSourceUpdates requires Source: EVM -> Destination: TON
func setEVMSourceUpdates(
	lane LaneConfig,
	onRampUpdatesByChain map[uint64]map[uint64]v1_6.OnRampDestinationUpdate,
	routerUpdatesByChain map[uint64]v1_6.RouterUpdates,
	feeQuoterDestUpdatesByChain map[uint64]map[uint64]fee_quoter.FeeQuoterDestChainConfig,
	feeQuoterPriceUpdatesByChain map[uint64]v1_6.FeeQuoterPriceUpdatePerSource,
	isTestRouter bool,
) {
	source := lane.Source.(EVMChainDefinition)
	dest := lane.Dest.(TonChainDefinition)
	isEnabled := !lane.IsDisabled

	// Setting the destination on the on ramp
	if onRampUpdatesByChain[source.Selector] == nil {
		onRampUpdatesByChain[source.Selector] = make(map[uint64]v1_6.OnRampDestinationUpdate)
	}
	onRampUpdatesByChain[source.Selector][dest.Selector] = v1_6.OnRampDestinationUpdate{
		IsEnabled:        isEnabled,
		TestRouter:       isTestRouter,
		AllowListEnabled: dest.AllowListEnabled,
	}

	// Setting the on ramp on the source router
	routerUpdatesOnSource := routerUpdatesByChain[source.Selector]
	if routerUpdatesByChain[source.Selector].OnRampUpdates == nil {
		routerUpdatesOnSource.OnRampUpdates = make(map[uint64]bool)
	}
	routerUpdatesOnSource.OnRampUpdates[dest.Selector] = isEnabled
	routerUpdatesByChain[source.Selector] = routerUpdatesOnSource

	// Setting the fee quoter destination on the source chain
	if feeQuoterDestUpdatesByChain[source.Selector] == nil {
		feeQuoterDestUpdatesByChain[source.Selector] = make(map[uint64]fee_quoter.FeeQuoterDestChainConfig)
	}
	feeQuoterDestUpdatesByChain[source.Selector][dest.Selector] = dest.GetConvertedEVMFeeQuoterConfig()

	// Setting the destination gas prices on the source chain
	feeQuoterPriceUpdatesOnSource := feeQuoterPriceUpdatesByChain[source.Selector]
	if feeQuoterPriceUpdatesOnSource.GasPrices == nil {
		feeQuoterPriceUpdatesOnSource.GasPrices = make(map[uint64]*big.Int)
	}
	feeQuoterPriceUpdatesOnSource.GasPrices[dest.Selector] = dest.GasPrice
	feeQuoterPriceUpdatesByChain[source.Selector] = feeQuoterPriceUpdatesOnSource

	// Setting the destination token prices on the source chain
	if feeQuoterPriceUpdatesOnSource.TokenPrices == nil {
		feeQuoterPriceUpdatesOnSource.TokenPrices = make(map[common.Address]*big.Int)
	}
	for tokenAddr, price := range source.TokenPrices {
		feeQuoterPriceUpdatesOnSource.TokenPrices[tokenAddr] = price
	}
}

// setEVMSourceUpdates requires Source: TON -> Destination: EVM
func setEVMDestUpdates(
	lane LaneConfig,
	routerUpdatesByChain map[uint64]v1_6.RouterUpdates,
	offRampUpdatesByChain map[uint64]map[uint64]v1_6.OffRampSourceUpdate,
	isTestRouter bool,
) {
	source := lane.Source.(TonChainDefinition)
	dest := lane.Dest.(EVMChainDefinition)
	isEnabled := !lane.IsDisabled

	// Setting the source on the off-ramp
	if offRampUpdatesByChain[dest.Selector] == nil {
		offRampUpdatesByChain[dest.Selector] = make(map[uint64]v1_6.OffRampSourceUpdate)
	}
	offRampUpdatesByChain[dest.Selector][source.Selector] = v1_6.OffRampSourceUpdate{
		IsEnabled:                 isEnabled,
		TestRouter:                isTestRouter,
		IsRMNVerificationDisabled: source.RMNVerificationDisabled,
	}

	// Setting the off-ramp on the dest router
	routerUpdatesOnDest := routerUpdatesByChain[dest.Selector]
	if routerUpdatesByChain[dest.Selector].OffRampUpdates == nil {
		routerUpdatesOnDest.OffRampUpdates = make(map[uint64]bool)
	}
	routerUpdatesOnDest.OffRampUpdates[source.Selector] = isEnabled
	routerUpdatesByChain[dest.Selector] = routerUpdatesOnDest
}
