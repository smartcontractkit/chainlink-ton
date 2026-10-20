package tvm

import (
	"github.com/xssnick/tonutils-go/address"
)

const (
	AddressLength     = 36
	AddressDataLength = 32
	ZeroAddressStr    = "0:0000000000000000000000000000000000000000000000000000000000000000"
)

var (
	ZeroAddress = address.MustParseRawAddr(ZeroAddressStr)

	// Dummy address for GRAM native as Wrapped GRAM is not accepted in TON CCIP yet. We use 0x1, it is an internal value for native coin. Can't be 0x0 because the CCIP plugin throws on zero addresses
	NativeGRAMAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")

	// Dummy address for LINK Jetton until we deploy real one
	LinkTokenAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000002")
)
