// Package ownable2step is a temporary compatibility shim that re-exports the
// public API of github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step.
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
package ownable2step

import (
	cciplibownable2step "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
)

type AcceptOwnership = cciplibownable2step.AcceptOwnership
type Storage = cciplibownable2step.Storage
type TransferOwnership = cciplibownable2step.TransferOwnership

var GetOwner = cciplibownable2step.GetOwner
var GetPendingOwner = cciplibownable2step.GetPendingOwner
