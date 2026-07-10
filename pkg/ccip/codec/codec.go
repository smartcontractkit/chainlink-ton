// Package codec is a temporary compatibility shim that re-exports the public API
// of github.com/smartcontractkit/chainlink-ton/cciplib/ccip/codec.
//
// The real implementation was moved into the standalone cciplib module. This
// shim exists solely so that the older chainlink pinned by integration-tests,
// which still imports this path, keeps compiling without a premature chainlink
// upgrade.
//
// Types are re-exported as aliases (=) so their identity matches cciplib's -
// callers (and mcms) must agree on the same underlying types.
//
// DELETE this shim once integration-tests bumps to a chainlink that imports the
// cciplib path directly.
package codec

import (
	cciplibcodec "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/codec"
)

// Types.
type (
	TokenDataEncoder = cciplibcodec.TokenDataEncoder
	RawAddr          = cciplibcodec.RawAddr
)

// Vars.
var (
	// ErrInvalidWorkchain forwards to cciplib/ccip/codec.ErrInvalidWorkchain.
	ErrInvalidWorkchain = cciplibcodec.ErrInvalidWorkchain
	// LeafDomainSeparator forwards to cciplib/ccip/codec.LeafDomainSeparator
	// (an immutable zero separator, so a value copy is safe).
	LeafDomainSeparator = cciplibcodec.LeafDomainSeparator
)

// Constructors and helpers.
var (
	NewTokenDataEncoder                 = cciplibcodec.NewTokenDataEncoder
	NewMessageHasherV1                  = cciplibcodec.NewMessageHasherV1
	NewExtraDataDecoder                 = cciplibcodec.NewExtraDataDecoder
	NewExecutePluginCodecV1             = cciplibcodec.NewExecutePluginCodecV1
	NewCommitPluginCodecV1              = cciplibcodec.NewCommitPluginCodecV1
	NewAddressCodec                     = cciplibcodec.NewAddressCodec
	ToRawAddr                           = cciplibcodec.ToRawAddr
	AddressBytesToTONAddress            = cciplibcodec.AddressBytesToTONAddress
	AddressBytesToTONAddressWithBurning = cciplibcodec.AddressBytesToTONAddressWithBurning
)
