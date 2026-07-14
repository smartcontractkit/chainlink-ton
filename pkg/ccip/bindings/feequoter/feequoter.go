// Package feequoter is a temporary compatibility shim that re-exports the public
// API of github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/feequoter.
//
// The real implementation was moved into the standalone cciplib module. This
// shim exists solely so that this repo's dependent modules (deployment,
// integration-tests) and external consumers still importing this path keep
// compiling without a premature upgrade to the cciplib import path.
//
// Types are re-exported as aliases (=) so their identity matches cciplib's -
// callers must agree on the same underlying types.
//
// DELETE this shim once all consumers import the cciplib path directly.
package feequoter

import (
	cciplibfeequoter "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/feequoter"
)

type AddPriceUpdater = cciplibfeequoter.AddPriceUpdater
type DestChainConfig = cciplibfeequoter.DestChainConfig
type DestChainConfigMap = cciplibfeequoter.DestChainConfigMap
type FeeToken = cciplibfeequoter.FeeToken
type GasPriceUpdate = cciplibfeequoter.GasPriceUpdate
type StaticConfig = cciplibfeequoter.StaticConfig
type Storage = cciplibfeequoter.Storage
type TokenPriceUpdate = cciplibfeequoter.TokenPriceUpdate
type UpdateDestChainConfig = cciplibfeequoter.UpdateDestChainConfig
type UpdateDestChainConfigs = cciplibfeequoter.UpdateDestChainConfigs
type UpdateFeeTokens = cciplibfeequoter.UpdateFeeTokens
type UpdatePrices = cciplibfeequoter.UpdatePrices
type UpdateTokenTransferFeeConfig = cciplibfeequoter.UpdateTokenTransferFeeConfig

var GetStaticConfig = cciplibfeequoter.GetStaticConfig
