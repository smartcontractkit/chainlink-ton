package tokenregistry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var (
	OpcodeGetTokenInfo = tvm.MustExtractMagic(reflect.TypeFor[GetTokenInfo]())
	OpcodeSetTokenInfo = tvm.MustExtractMagic(reflect.TypeFor[SetTokenInfo]())
)

type Storage struct {
	ID   uint32    `tlb:"## 32"`
	Info TokenInfo `tlb:"."`
}

type TokenInfo struct {
	TokenPool     *address.Address `tlb:"addr"`
	MinterAddress *address.Address `tlb:"addr"`
	Enabled       bool             `tlb:"bool"`
}

// GetTokenInfo message to query token information from the registry.
// crc32('TokenRegistry_GetTokenInfo')
type GetTokenInfo struct {
	_ tlb.Magic `tlb:"#DD5D5127" json:"-"` //nolint:revive // Ignore opcode tag
}

// SetTokenInfo message to set token information in the registry.
// crc32('TokenRegistry_SetTokenInfo')
type SetTokenInfo struct {
	_    tlb.Magic `tlb:"#d24387a4" json:"-"` //nolint:revive // Ignore opcode tag
	Info TokenInfo `tlb:"."`
}

// ReturnTokenInfo message returned by the contract when token info is queried.
// crc32('TokenRegistry_ReturnTokenInfo')
type ReturnTokenInfo struct {
	_             tlb.Magic        `tlb:"#ddccddb5" json:"-"` //nolint:revive // Ignore opcode tag
	MinterAddress *address.Address `tlb:"addr"`
	TokenPool     *address.Address `tlb:"addr"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	GetTokenInfo{},
	SetTokenInfo{},
	ReturnTokenInfo{},
}).MustWithStorageType(Storage{})
