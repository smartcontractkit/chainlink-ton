// Package tokenadminregistryentry contains the ABI binding for a deterministic
// per-token TokenAdminRegistryEntry shard.
package tokenadminregistryentry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// Version is TokenAdminRegistryEntry_VERSION: the entry version requesters
// declare as the minimum they can consume.
const Version = 1

var (
	OpcodeGetTokenInfo = tvm.MustExtractMagic(reflect.TypeFor[GetTokenInfo]())
)

type Storage struct {
	TokenAddress *address.Address `tlb:"addr"`
	TokenInfo    TokenInfo        `tlb:"."`
	AdminConfig  AdminConfig      `tlb:"^"`
}

type TokenInfo struct {
	TokenPool     *address.Address `tlb:"addr"`
	MinterAddress *address.Address `tlb:"addr"`
	Version       uint32           `tlb:"## 32"`
}

type AdminConfig struct {
	TokenAdminRegistry   *address.Address `tlb:"addr"`
	Administrator        *address.Address `tlb:"addr"`
	PendingAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_GetTokenInfo')
type GetTokenInfo struct {
	_               tlb.Magic `tlb:"#7aef4c2d" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID         uint64    `tlb:"## 64"`
	MinEntryVersion uint16    `tlb:"## 16"`
}

// crc32('TokenAdminRegistryEntry_RegistrationInitialized')
type RegistrationInitialized struct {
	_       tlb.Magic `tlb:"#31580269" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64    `tlb:"## 64"`
}

// crc32('TokenAdminRegistryEntry_ProposeAdministrator')
type ProposeAdministrator struct {
	_               tlb.Magic        `tlb:"#6dcbe573" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID         uint64           `tlb:"## 64"`
	MinEntryVersion uint16           `tlb:"## 16"`
	Administrator   *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_TransferAdminRole')
type TransferAdminRole struct {
	_                tlb.Magic        `tlb:"#8b1503cf" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID          uint64           `tlb:"## 64"`
	MinEntryVersion  uint16           `tlb:"## 16"`
	Actor            *address.Address `tlb:"addr"`
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_AcceptAdminRole')
type AcceptAdminRole struct {
	_               tlb.Magic        `tlb:"#39c6e872" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID         uint64           `tlb:"## 64"`
	MinEntryVersion uint16           `tlb:"## 16"`
	Actor           *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_SetPool')
// Sent by the root, which forwards the original sender as Actor.
type SetPool struct {
	_               tlb.Magic        `tlb:"#a64e05c9" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID         uint64           `tlb:"## 64"`
	MinEntryVersion uint16           `tlb:"## 16"`
	Actor           *address.Address `tlb:"addr"`
	TokenPool       *address.Address `tlb:"addr"`
}

// Pending is a request kept in flight while its entry is upgraded.
type Pending struct {
	Sender *address.Address `tlb:"addr"`
	Body   *cell.Cell       `tlb:"^"`
}

// crc32('TokenAdminRegistryEntry_UpgradeAndResume')
type UpgradeAndResume struct {
	_       tlb.Magic  `tlb:"#1fa23ab9" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64     `tlb:"## 64"`
	Code    *cell.Cell `tlb:"^"`
	Pending *Pending   `tlb:"maybe ^"`
}

// crc32('TokenAdminRegistryEntry_Resume')
type Resume struct {
	_       tlb.Magic `tlb:"#47d63a64" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Pending Pending   `tlb:"^"`
}

// crc32('TokenAdminRegistryEntry_ReturnTokenInfo')
type ReturnTokenInfo struct {
	_             tlb.Magic        `tlb:"#0a58e678" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID       uint64           `tlb:"## 64"`
	MinterAddress *address.Address `tlb:"addr"`
	TokenPool     *address.Address `tlb:"addr"`
	Version       uint32           `tlb:"## 32"`
}

// crc32('TokenAdminRegistryEntry_TokenInfoUnavailable')
type TokenInfoUnavailable struct {
	_       tlb.Magic `tlb:"#30a47901" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64    `tlb:"## 64"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	GetTokenInfo{},
	RegistrationInitialized{},
	ProposeAdministrator{},
	TransferAdminRole{},
	AcceptAdminRole{},
	SetPool{},
	UpgradeAndResume{},
	Resume{},
	ReturnTokenInfo{},
	TokenInfoUnavailable{},
}).MustWithStorageType(Storage{})
