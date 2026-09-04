// Package tokenadminregistryentry contains the ABI binding for a deterministic
// per-token TokenAdminRegistryEntry shard.
package tokenadminregistryentry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

var (
	OpcodeGetTokenInfo = tvm.MustExtractMagic(reflect.TypeFor[GetTokenInfo]())
	OpcodeSetTokenInfo = tvm.MustExtractMagic(reflect.TypeFor[SetTokenInfo]())
)

type Storage struct {
	TokenAddress *address.Address `tlb:"addr"`
	TokenInfo    TokenInfo        `tlb:"."`
	AdminConfig  AdminConfig      `tlb:"^"`
}

type TokenInfo struct {
	TokenPool     *address.Address `tlb:"addr"`
	MinterAddress *address.Address `tlb:"addr"`
	Enabled       bool             `tlb:"bool"`
	Version       uint32           `tlb:"## 32"`
}

type AdminConfig struct {
	TokenAdminRegistry   *address.Address `tlb:"addr"`
	Administrator        *address.Address `tlb:"addr"`
	PendingAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_GetTokenInfo')
type GetTokenInfo struct {
	_ tlb.Magic `tlb:"#7aef4c2d" json:"-"` //nolint:revive
}

// crc32('TokenAdminRegistryEntry_SetTokenInfo')
type SetTokenInfo struct {
	_    tlb.Magic `tlb:"#75f19aae" json:"-"` //nolint:revive
	Info TokenInfo `tlb:"."`
}

// crc32('TokenAdminRegistryEntry_RegistrationInitialized')
type RegistrationInitialized struct {
	_ tlb.Magic `tlb:"#31580269" json:"-"` //nolint:revive
}

// crc32('TokenAdminRegistryEntry_ProposeAdministrator')
type ProposeAdministrator struct {
	_             tlb.Magic        `tlb:"#31d2bb6e" json:"-"` //nolint:revive
	Administrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_TransferAdminRole')
type TransferAdminRole struct {
	_                tlb.Magic        `tlb:"#5f7f84e1" json:"-"` //nolint:revive
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_AcceptAdminRole')
type AcceptAdminRole struct {
	_ tlb.Magic `tlb:"#d1fbd97c" json:"-"` //nolint:revive
}

// crc32('TokenAdminRegistryEntry_SetPool')
type SetPool struct {
	_         tlb.Magic        `tlb:"#a7c4c16c" json:"-"` //nolint:revive
	TokenPool *address.Address `tlb:"addr"`
	Enabled   bool             `tlb:"bool"`
}

// crc32('TokenAdminRegistryEntry_ReturnTokenInfo')
type ReturnTokenInfo struct {
	_             tlb.Magic        `tlb:"#0a58e678" json:"-"` //nolint:revive
	MinterAddress *address.Address `tlb:"addr"`
	TokenPool     *address.Address `tlb:"addr"`
	Version       uint32           `tlb:"## 32"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	GetTokenInfo{},
	SetTokenInfo{},
	RegistrationInitialized{},
	ProposeAdministrator{},
	TransferAdminRole{},
	AcceptAdminRole{},
	SetPool{},
	ReturnTokenInfo{},
}).MustWithStorageType(Storage{})
