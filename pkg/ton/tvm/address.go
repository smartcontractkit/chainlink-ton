package tvm

import "github.com/xssnick/tonutils-go/address"

const (
	AddressLength  = 36
	ZeroAddressStr = "0:0000000000000000000000000000000000000000000000000000000000000000"
)

var ZeroAddress = address.MustParseRawAddr(ZeroAddressStr)
