// Package common is a temporary compatibility shim that re-exports the public
// API of github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common.
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
package common

import (
	cciplibcommon "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
)

// Types.
type (
	SnakedCell[T any] = cciplibcommon.SnakedCell[T]
)
