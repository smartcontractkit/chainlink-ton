// Package onramp is a temporary compatibility shim that re-exports the public
// API of github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp.
//
// The real implementation was moved into the standalone cciplib module. This
// shim exists solely so that external consumers still importing this path (e.g.
// chainlink-ccip's EVM/Solana test adapters) keep compiling without a premature
// upgrade to the cciplib import path.
//
// Types are re-exported as aliases (=) so their identity matches cciplib's -
// callers must agree on the same underlying types.
//
// DELETE this shim once all consumers import the cciplib path directly.
package onramp

import (
	cciplibonramp "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
)

// Types.
type (
	GenericExtraArgsV2 = cciplibonramp.GenericExtraArgsV2
	Account256         = cciplibonramp.Account256
	SVMExtraArgsV1     = cciplibonramp.SVMExtraArgsV1
)
