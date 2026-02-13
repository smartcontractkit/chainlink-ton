package ops

import (
	"crypto/rand"
	"encoding/binary"
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/testadapters"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/testadapter"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
)

const (
	ChainSelEVMTest90000001     = 909606746561742123
	DestGasOverhead             = 300_000 // Commit and Exec costs
	CalldataGasPerByteBase      = 16
	CalldataGasPerByteHigh      = 40
	CalldataGasPerByteThreshold = 3000
)

// Deprecated: Use tvm.TonTokenAddr instead.
var TonTokenAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")

var (
	// TODO Remove in favor of the canonical model
	EvmFeeQuoterDestChainConfig = config.FeeQuoterDestChainConfig{
		IsEnabled:                         true,
		MaxNumberOfTokensPerMsg:           10,
		MaxDataBytes:                      30_000,
		MaxPerMsgGasLimit:                 3_000_000,
		DestGasOverhead:                   DestGasOverhead,
		DestGasPerPayloadByteBase:         CalldataGasPerByteBase,
		DestGasPerPayloadByteHigh:         CalldataGasPerByteHigh,
		DestGasPerPayloadByteThreshold:    CalldataGasPerByteThreshold,
		DestDataAvailabilityOverheadGas:   100,
		DestGasPerDataAvailabilityByte:    16,
		DestDataAvailabilityMultiplierBps: 1,
		ChainFamilySelector:               config.EVMFamilySelector,
		EnforceOutOfOrder:                 false,
		DefaultTokenFeeUSDCents:           25,
		DefaultTokenDestGasOverhead:       90_000,
		DefaultTxGasLimit:                 200_000,
		GasMultiplierWeiPerEth:            11e17,
		GasPriceStalenessThreshold:        0,
		NetworkFeeUSDCents:                10,
	}

	EvmFeeQuoterDestChainCanonicalConfig = lanes.FeeQuoterDestChainConfig{
		IsEnabled:                         true,
		MaxNumberOfTokensPerMsg:           10,
		MaxDataBytes:                      30_000,
		MaxPerMsgGasLimit:                 3_000_000,
		DestGasOverhead:                   DestGasOverhead,
		DestGasPerPayloadByteBase:         CalldataGasPerByteBase,
		DestGasPerPayloadByteHigh:         CalldataGasPerByteHigh,
		DestGasPerPayloadByteThreshold:    CalldataGasPerByteThreshold,
		DestDataAvailabilityOverheadGas:   100,
		DestGasPerDataAvailabilityByte:    16,
		DestDataAvailabilityMultiplierBps: 1,
		ChainFamilySelector:               config.EVMFamilySelector,
		EnforceOutOfOrder:                 false,
		DefaultTokenFeeUSDCents:           25,
		DefaultTokenDestGasOverhead:       90_000,
		DefaultTxGasLimit:                 200_000,
		GasMultiplierWeiPerEth:            11e17,
		GasPriceStalenessThreshold:        0,
		NetworkFeeUSDCents:                10,
	}

	// TODO Remove in favor of the canonical model
	// Default fee quoter config for TON CCIP testing
	TonFeeQuoterDestChainConfig = config.FeeQuoterDestChainConfig{
		IsEnabled:                       true,
		MaxNumberOfTokensPerMsg:         0,
		MaxDataBytes:                    100,
		MaxPerMsgGasLimit:               100,
		DestGasOverhead:                 0,
		DestGasPerPayloadByteBase:       0,
		DestGasPerPayloadByteHigh:       0,
		DestGasPerPayloadByteThreshold:  0,
		DestDataAvailabilityOverheadGas: 0,
		DestGasPerDataAvailabilityByte:  0,
		ChainFamilySelector:             config.TVMFamilySelector,
		EnforceOutOfOrder:               false,
		DefaultTokenFeeUSDCents:         0,
		DefaultTokenDestGasOverhead:     0,
		DefaultTxGasLimit:               1,
		GasMultiplierWeiPerEth:          0,
		GasPriceStalenessThreshold:      0,
		NetworkFeeUSDCents:              0,
	}

	// Default fee quoter config for TON CCIP testing
	TonFeeQuoterDestChainCanonicalConfig = lanes.FeeQuoterDestChainConfig{
		IsEnabled:                       true,
		MaxNumberOfTokensPerMsg:         0,
		MaxDataBytes:                    100,
		MaxPerMsgGasLimit:               100,
		DestGasOverhead:                 0,
		DestGasPerPayloadByteBase:       0,
		DestGasPerPayloadByteHigh:       0,
		DestGasPerPayloadByteThreshold:  0,
		DestDataAvailabilityOverheadGas: 0,
		DestGasPerDataAvailabilityByte:  0,
		ChainFamilySelector:             config.TVMFamilySelector,
		EnforceOutOfOrder:               false,
		DefaultTokenFeeUSDCents:         0,
		DefaultTokenDestGasOverhead:     0,
		DefaultTxGasLimit:               1,
		GasMultiplierWeiPerEth:          0,
		GasPriceStalenessThreshold:      0,
		NetworkFeeUSDCents:              0,
	}
)

func DeployChainContractsConfig(t *testing.T, env cldf.Environment, chainSelector uint64, contractVersion string, idForContracts uint32) DeployCCIPContractsCfg {
	chain := env.BlockChains.TonChains()[chainSelector]
	deployer := chain.Wallet

	// if contractVersion is not set, use local version
	if contractVersion == "" {
		contractVersion = sequence.ContractsVersionLocal
	}

	ccipContractSemver := semver.MustParse("1.6.0")
	return DeployCCIPContractsCfg{
		TonChainSelector: chainSelector,
		Params: config.ChainContractParams{
			RouterParams: config.RouterParams{
				ID:              idForContracts,
				Coin:            "0.05",
				ContractsSemver: ccipContractSemver,
			},
			FeeQuoterParams: config.FeeQuoterParams{
				ID:                           idForContracts,
				Coin:                         "0.05",
				ContractsSemver:              ccipContractSemver,
				MaxFeeJuelsPerMsg:            big.NewInt(0).Mul(big.NewInt(2e2), big.NewInt(1e18)),
				TokenPriceStalenessThreshold: 0,
				FeeTokens: map[config.TokenSymbol]config.FeeToken{
					"TON": {
						Address:                    tvm.TonTokenAddr,
						PremiumMultiplierWeiPerEth: 1,
					},
				},
			},
			OffRampParams: config.OffRampParams{
				ID:                               idForContracts,
				Coin:                             "0.05",
				ContractsSemver:                  ccipContractSemver,
				ChainSelector:                    chain.Selector,
				PermissionlessExecutionThreshold: 0,
			},
			OnRampParams: config.OnRampParams{
				ID:              idForContracts,
				Coin:            "0.05",
				ContractsSemver: ccipContractSemver,
				ChainSelector:   ChainSelEVMTest90000001,
				// TODO:
				// AllowlistAdmin: &address.Address{},
				FeeAggregator: deployer.WalletAddress(),
				Reserve:       "0.5",
			},
			ReceiverParams: config.ReceiverParams{
				ID:              idForContracts,
				Coin:            "0.05",
				ContractsSemver: ccipContractSemver,
			},
		},
		ContractsVersion: contractVersion,
	}
}

// TODO add TON token price into func parameters
func AddLaneTONConfig(env *cldf.Environment, onRamp []byte, from, to uint64, fromFamily, toFamily string, gasPrices map[uint64]*big.Int) config.LaneConfig {
	if fromFamily != chainsel.FamilyTon && toFamily != chainsel.FamilyTon {
		env.Logger.Fatalf("AddLaneTONChangesets: expected at least one chain to be TON, got fromFamily=%s, toFamily=%s", fromFamily, toFamily)
	}

	var src, dest config.ChainDefinition

	// TODO(@jadepark-dev): config.CCIPTokenPrice("2", 9) was causing fee quoter to return 572+ TON for sending a message.
	// TODO: Investigate and fix the root cause.
	tonTokenPrice, err := config.CCIPTokenPrice("2", 3) // Example value
	if err != nil {
		env.Logger.Fatalf("AddLaneTONChangesets: failed to get TON token price: %v", err)
	}
	linkTokenPrice, err := config.CCIPTokenPrice("10", 18) // Example value
	if err != nil {
		env.Logger.Fatalf("AddLaneTONChangesets: failed to get Link token price: %v", err)
	}
	switch fromFamily {
	case chainsel.FamilyEVM:
		src = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				RMNVerificationDisabled: true,
			},
			Selector: from,
			GasPrice: gasPrices[from],
		}
	case chainsel.FamilyTon:
		src = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: from,
			GasPrice: gasPrices[from],
			TokenPrices: map[string]*big.Int{
				tvm.TonTokenAddr.String():  tonTokenPrice,
				tvm.LinkTokenAddr.String(): linkTokenPrice,
			},
			FeeQuoterDestChainConfig: TonFeeQuoterDestChainConfig,
			// TokenTransferFeeConfigs: , TODO:
		}
	default:
		env.Logger.Fatalf("Unsupported source chain family: %v", fromFamily)
	}

	switch toFamily {
	case chainsel.FamilyEVM:
		dest = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				AllowListEnabled: false,
			},
			Selector:                 to,
			GasPrice:                 gasPrices[to],
			FeeQuoterDestChainConfig: EvmFeeQuoterDestChainConfig,
		}
	case chainsel.FamilyTon:
		dest = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: to,
			GasPrice: gasPrices[to],
			TokenPrices: map[string]*big.Int{
				tvm.TonTokenAddr.String(): tonTokenPrice,
			},
			FeeQuoterDestChainConfig: TonFeeQuoterDestChainConfig,
			// TokenTransferFeeConfigs: , TODO:
		}
	default:
		env.Logger.Fatalf("Unsupported destination chain family: %v", toFamily)
	}

	return config.LaneConfig{
		Source:        src,
		Dest:          dest,
		OnRampVersion: []byte{1, 6, 1},
		OnRamp:        onRamp,
		IsDisabled:    false,
	}
}

// Deprecated: Use testadapters instead
func SendCCIPMessage(
	e cldf.Environment,
	state state.CCIPChainState,
	sourceChain uint64,
	msg router.CCIPSend) (uint64, any, error) {
	chain := e.BlockChains.TonChains()[sourceChain]
	stateProvider := &testadapters.DataStoreStateProvider{Selector: sourceChain, DS: e.DataStore}
	return testadapter.SendCCIPMessage(e.GetContext(), chain, stateProvider, sourceChain, msg)
}

func RandomUint32() (uint32, error) {
	var b [4]byte
	_, err := rand.Read(b[:])
	if err != nil {
		return 0, err
	}
	return binary.LittleEndian.Uint32(b[:]), nil
}
