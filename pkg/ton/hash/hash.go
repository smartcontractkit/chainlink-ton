// Package hash is a temporary compatibility shim that re-exports the public API
// of github.com/smartcontractkit/chainlink-ton/cciplib/ton/hash.
//
// The real implementation was moved into the standalone cciplib module. This
// shim exists solely so that the older chainlink pinned by integration-tests,
// which still imports this path, keeps compiling without a premature chainlink
// upgrade.
//
// DELETE this shim once integration-tests bumps to a chainlink that imports the
// cciplib path directly.
package hash

import (
	cciplibhash "github.com/smartcontractkit/chainlink-ton/cciplib/ton/hash"
)

// CRC32 forwards to cciplib/ton/hash.CRC32.
var CRC32 = cciplibhash.CRC32
