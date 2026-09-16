// Package ocr is a temporary compatibility shim that re-exports the public API
// of github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr.
//
// The real implementation was moved into the standalone cciplib module. This
// shim exists solely so that this repo's dependent modules (integration-tests)
// and external consumers still importing this path keep compiling without a
// premature upgrade to the cciplib import path.
//
// Types are re-exported as aliases (=) so their identity matches cciplib's -
// callers must agree on the same underlying types.
//
// DELETE this shim once all consumers import the cciplib path directly.
package ocr

import (
	cciplibocr "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr"
)

type CommitReport = cciplibocr.CommitReport
type GasPriceUpdate = cciplibocr.GasPriceUpdate
type MerkleRoot = cciplibocr.MerkleRoot
type PriceUpdates = cciplibocr.PriceUpdates
type TokenPriceUpdate = cciplibocr.TokenPriceUpdate

const ErrorBigFMustBePositive = cciplibocr.ErrorBigFMustBePositive
