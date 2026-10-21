package config

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	cldf_provider "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
)

// TON Local Network Configuration
//
// This package centralizes the TON local network (MyLocalTon-docker) configuration used for testing.
// The versions here must be compatible with the current CCIP contract versions deployed in this repository.
//
// When to Update:
//   - When TON CCIP contracts are updated and require different network capabilities
//   - When mylocalton-docker adds features needed by the contracts
//   - When blockchain behavior changes affect contract execution

const (
	mainnetGlobalConfigURL = "https://ton-blockchain.github.io/global.config.json"
	mainnetFetchTimeout    = 15 * time.Second
)

// FallbackMainnetGasPrices and FallbackMainnetFwdPrices are TON mainnet's basechain fees
// (config params 21 and 25), used when they can't be fetched from mainnet.
// MyLocalTon's genesis defaults are ~15x higher.
var (
	FallbackMainnetGasPrices = tlb.ConfigGasLimitsPrices{
		HasFlatPricing:          true,
		FlatGasLimit:            100,
		FlatGasPrice:            6667,
		HasSeparateSpecialLimit: true,
		GasPrice:                4369067,
		GasLimit:                1_000_000,
		SpecialGasLimit:         1_000_000,
		GasCredit:               10_000,
		BlockGasLimit:           10_000_000,
		FreezeDueLimit:          100_000_000,
		DeleteDueLimit:          1_000_000_000,
	}
	FallbackMainnetFwdPrices = tlb.ConfigMsgForwardPrices{
		LumpPrice: 66667,
		BitPrice:  4369067,
		CellPrice: 436906667,
		IHRFactor: 98304,
		FirstFrac: 21845,
		NextFrac:  21845,
	}
)

type feePrices struct {
	gas tlb.ConfigGasLimitsPrices
	fwd tlb.ConfigMsgForwardPrices
}

var mainnetFeePrices = sync.OnceValue(func() feePrices {
	ctx, cancel := context.WithTimeout(context.Background(), mainnetFetchTimeout)
	defer cancel()
	prices, err := fetchMainnetFeePrices(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to fetch TON mainnet fee config, using hardcoded fallback for MyLocalTon genesis")
		return feePrices{gas: FallbackMainnetGasPrices, fwd: FallbackMainnetFwdPrices}
	}
	return prices
})

func fetchMainnetFeePrices(ctx context.Context) (feePrices, error) {
	pool := liteclient.NewConnectionPool()
	defer pool.Stop()
	if err := pool.AddConnectionsFromConfigUrl(ctx, mainnetGlobalConfigURL); err != nil {
		return feePrices{}, fmt.Errorf("connect to mainnet liteservers: %w", err)
	}
	api := ton.NewAPIClient(pool)
	block, err := api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return feePrices{}, fmt.Errorf("get masterchain info: %w", err)
	}
	cfg, err := api.GetBlockchainConfig(ctx, block, int32(tlb.ConfigParamGasPricesBasechain), int32(tlb.ConfigParamMsgForwardPricesBasechain))
	if err != nil {
		return feePrices{}, fmt.Errorf("get blockchain config: %w", err)
	}
	gas, err := cfg.GetGasPrices(false)
	if err != nil {
		return feePrices{}, fmt.Errorf("parse gas prices: %w", err)
	}
	fwd, err := cfg.GetMsgForwardPrices(false)
	if err != nil {
		return feePrices{}, fmt.Errorf("parse forward prices: %w", err)
	}
	return feePrices{gas: *gas, fwd: *fwd}, nil
}

// genesisFeeOverride builds a CONFIG_CODE_FIF value that sets params 21 and 25, which
// MyLocalTon doesn't expose as env vars. start-genesis.sh seds it into gen-zerostate.fif's
// `"auto/CONFIG_CODE_FIF" include` (run before the config dict is written), so it closes
// that string, sets the params, then includes the stock config code. Must not contain '/' or '&'.
// Arguments follow CreateState.fif's make-gas-prices and make-msg-fwd-prices.
func genesisFeeOverride(gas tlb.ConfigGasLimitsPrices, fwd tlb.ConfigMsgForwardPrices) string {
	return fmt.Sprintf(`config-code.fif" drop `+
		`%d %d %d %d %d %d %d %d %d config.gas_prices! `+
		`%d %d %d %d %d %d config.fwd_prices! "config-code.fif`,
		gas.GasPrice, gas.GasLimit, gas.SpecialGasLimit, gas.GasCredit, gas.BlockGasLimit,
		gas.FreezeDueLimit, gas.DeleteDueLimit, gas.FlatGasLimit, gas.FlatGasPrice,
		fwd.LumpPrice, fwd.BitPrice, fwd.CellPrice, fwd.IHRFactor, fwd.FirstFrac, fwd.NextFrac,
	)
}

// LocalNetworkConfig returns the CTFChainProviderConfig compatible with current contract versions.
// The once parameter ensures the CTF network is only initialized once across the test suite.
// Genesis fees are set to TON mainnet's, fetched once per process.
func LocalNetworkConfig(once *sync.Once) cldf_provider.CTFChainProviderConfig {
	fees := mainnetFeePrices()
	return cldf_provider.CTFChainProviderConfig{
		Once: once,
		// LocalNetworkImage is the TON local network Docker image version compatible with current contracts.
		// Source: https://github.com/neodix42/mylocalton-docker
		Image: "ghcr.io/neodix42/mylocalton-docker:v4.0.0",
		CustomEnv: map[string]string{
			"VERSION_CAPABILITIES":        "12",  // This controls which TVM features are enabled in the local network.
			"NEXT_BLOCK_GENERATION_DELAY": "0.5", // This is the recommended block generation delay for faster testing.
			"CONFIG_CODE_FIF":             genesisFeeOverride(fees.gas, fees.fwd),
		},
	}
}
