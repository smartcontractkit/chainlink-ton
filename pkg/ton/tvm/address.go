package tvm

import "github.com/xssnick/tonutils-go/address"

const (
	AddressLength  = 36
	ZeroAddressStr = "0:0000000000000000000000000000000000000000000000000000000000000000"
)

var ZeroAddress = address.MustParseRawAddr(ZeroAddressStr)

// Dummy address for Wrapped TON as there is no Wrapped native available yet. We use 0x1, it is an internal value for native token. Can't be 0x0 because the CCIP plugin throws on zero addresses
var TonTokenAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")

// Dummy address for LINK Jetton until we deploy real one
var LinkTokenAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000002")
