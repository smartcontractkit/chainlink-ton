// Package tokenadminregistry contains the ABI binding for the standalone
// TokenAdminRegistry root contract.
package tokenadminregistry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/versioning/upgradeable"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenadminregistryentry"
)

var (
	OpcodeRegisterToken                = tvm.MustExtractMagic(reflect.TypeFor[RegisterToken]())
	OpcodeOverridePendingAdministrator = tvm.MustExtractMagic(reflect.TypeFor[OverridePendingAdministrator]())
	OpcodeTransferAdminRole            = tvm.MustExtractMagic(reflect.TypeFor[TransferAdminRole]())
	OpcodeAcceptAdminRole              = tvm.MustExtractMagic(reflect.TypeFor[AcceptAdminRole]())
	OpcodeSetPool                      = tvm.MustExtractMagic(reflect.TypeFor[SetPool]())
	OpcodeUpgradeEntry                 = tvm.MustExtractMagic(reflect.TypeFor[UpgradeEntry]())
	OpcodeGetTokenInfo                 = tvm.MustExtractMagic(reflect.TypeFor[GetTokenInfo]())
	OpcodeReturnTokenInfo              = tvm.MustExtractMagic(reflect.TypeFor[ReturnTokenInfo]())
)

type Storage struct {
	ID      uint32               `tlb:"## 32"`
	Ownable ownable2step.Storage `tlb:"."`
}

// crc32('TokenAdminRegistry_RegisterToken')
type RegisterToken struct {
	_             tlb.Magic                         `tlb:"#be8621a2" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID       uint64                            `tlb:"## 64"`
	TokenAddress  *address.Address                  `tlb:"addr"`
	TokenInfo     tokenadminregistryentry.TokenInfo `tlb:"^"`
	Administrator *address.Address                  `tlb:"addr"`
}

// crc32('TokenAdminRegistry_OverridePendingAdministrator')
type OverridePendingAdministrator struct {
	_             tlb.Magic        `tlb:"#fddaa034" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID       uint64           `tlb:"## 64"`
	TokenAddress  *address.Address `tlb:"addr"`
	Administrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_TransferAdminRole')
// The root derives the token entry and forwards the sender as its actor.
type TransferAdminRole struct {
	_                tlb.Magic        `tlb:"#dc67ebd0" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID          uint64           `tlb:"## 64"`
	TokenAddress     *address.Address `tlb:"addr"`
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_AcceptAdminRole')
// The root derives the token entry and forwards the sender as its actor.
type AcceptAdminRole struct {
	_            tlb.Magic        `tlb:"#be28e166" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID      uint64           `tlb:"## 64"`
	TokenAddress *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_SetPool')
// The root derives the token entry and forwards the sender as its actor.
type SetPool struct {
	_            tlb.Magic        `tlb:"#37bcaede" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID      uint64           `tlb:"## 64"`
	TokenAddress *address.Address `tlb:"addr"`
	TokenPool    *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_GetTokenInfo')
// CCIP read path: the root resolves the token's entry and replies ReturnTokenInfo.
type GetTokenInfo struct {
	_       tlb.Magic        `tlb:"#ec5f855e" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64           `tlb:"## 64"`
	Token   *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_TokenInfoResolved')
// Entry answer relayed to Requester after the root validates the entry address.
type TokenInfoResolved struct {
	_         tlb.Magic                         `tlb:"#8f422c44" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID   uint64                            `tlb:"## 64"`
	Token     *address.Address                  `tlb:"addr"`
	Requester *address.Address                  `tlb:"addr"`
	TokenInfo tokenadminregistryentry.TokenInfo `tlb:"^"`
}

// crc32('TokenAdminRegistry_ReturnTokenInfo')
type ReturnTokenInfo struct {
	_             tlb.Magic        `tlb:"#8db6ef6c" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID       uint64           `tlb:"## 64"`
	Token         *address.Address `tlb:"addr"`
	MinterAddress *address.Address `tlb:"addr"`
	TokenPool     *address.Address `tlb:"addr"`
	Version       uint32           `tlb:"## 32"`
}

// crc32('TokenAdminRegistry_EntryUpgradeRequest')
// Sent by a stale entry with the request it deferred.
type EntryUpgradeRequest struct {
	_       tlb.Magic                       `tlb:"#55b8b654" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64                          `tlb:"## 64"`
	Token   *address.Address                `tlb:"addr"`
	Pending tokenadminregistryentry.Pending `tlb:"^"`
}

// crc32('TokenAdminRegistry_UpgradeEntry')
// Permissionless: upgrades the derived entry to the root's entry code.
type UpgradeEntry struct {
	_            tlb.Magic        `tlb:"#4d52f09d" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID      uint64           `tlb:"## 64"`
	TokenAddress *address.Address `tlb:"addr"`
}

// The following messages are sent by a deterministic entry to this root and
// emitted externally after the root validates the entry address.
// crc32('TokenAdminRegistry_AdministratorTransferRequested')
type AdministratorTransferRequested struct {
	_                    tlb.Magic        `tlb:"#140b1e91" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID              uint64           `tlb:"## 64"`
	Token                *address.Address `tlb:"addr"`
	CurrentAdministrator *address.Address `tlb:"addr"`
	NewAdministrator     *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_AdministratorTransferred')
type AdministratorTransferred struct {
	_                tlb.Magic        `tlb:"#e2c74db4" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID          uint64           `tlb:"## 64"`
	Token            *address.Address `tlb:"addr"`
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_PoolSet')
type PoolSet struct {
	_            tlb.Magic        `tlb:"#cef01a87" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID      uint64           `tlb:"## 64"`
	Token        *address.Address `tlb:"addr"`
	PreviousPool *address.Address `tlb:"addr"`
	NewPool      *address.Address `tlb:"addr"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	RegisterToken{},
	OverridePendingAdministrator{},
	TransferAdminRole{},
	AcceptAdminRole{},
	SetPool{},
	GetTokenInfo{},
	TokenInfoResolved{},
	ReturnTokenInfo{},
	EntryUpgradeRequest{},
	UpgradeEntry{},
	upgradeable.Upgrade{},
	AdministratorTransferRequested{},
	AdministratorTransferred{},
	PoolSet{},
}).MustWithStorageType(Storage{})
