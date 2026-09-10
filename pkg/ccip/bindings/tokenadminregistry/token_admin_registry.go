// Package tokenadminregistry contains the ABI binding for the standalone
// TokenAdminRegistry root contract.
package tokenadminregistry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenadminregistryentry"
)

var (
	OpcodeSetEntryDeployment           = tvm.MustExtractMagic(reflect.TypeFor[SetEntryDeployment]())
	OpcodeRegisterToken                = tvm.MustExtractMagic(reflect.TypeFor[RegisterToken]())
	OpcodeOverridePendingAdministrator = tvm.MustExtractMagic(reflect.TypeFor[OverridePendingAdministrator]())
	OpcodeTransferAdminRole            = tvm.MustExtractMagic(reflect.TypeFor[TransferAdminRole]())
	OpcodeAcceptAdminRole              = tvm.MustExtractMagic(reflect.TypeFor[AcceptAdminRole]())
)

type Storage struct {
	ID              uint32               `tlb:"## 32"`
	Ownable         ownable2step.Storage `tlb:"."`
	EntryDeployment EntryDeployment      `tlb:"."`
}

type EntryDeployment struct {
	DeployableCode *cell.Cell `tlb:"^"`
	EntryCode      *cell.Cell `tlb:"^"`
}

// crc32('TokenAdminRegistry_SetEntryDeployment')
type SetEntryDeployment struct {
	_               tlb.Magic       `tlb:"#3ec09499" json:"-"` //nolint:revive
	QueryID         uint64          `tlb:"## 64"`
	EntryDeployment EntryDeployment `tlb:"."`
}

// crc32('TokenAdminRegistry_RegisterToken')
type RegisterToken struct {
	_             tlb.Magic                         `tlb:"#be8621a2" json:"-"` //nolint:revive
	QueryID       uint64                            `tlb:"## 64"`
	TokenAddress  *address.Address                  `tlb:"addr"`
	TokenInfo     tokenadminregistryentry.TokenInfo `tlb:"^"`
	Administrator *address.Address                  `tlb:"addr"`
}

// crc32('TokenAdminRegistry_OverridePendingAdministrator')
type OverridePendingAdministrator struct {
	_             tlb.Magic        `tlb:"#fddaa034" json:"-"` //nolint:revive
	QueryID       uint64           `tlb:"## 64"`
	TokenAddress  *address.Address `tlb:"addr"`
	Administrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_TransferAdminRole')
// The root derives the token entry and forwards the sender as its actor.
type TransferAdminRole struct {
	_                tlb.Magic        `tlb:"#dc67ebd0" json:"-"` //nolint:revive
	QueryID          uint64           `tlb:"## 64"`
	TokenAddress     *address.Address `tlb:"addr"`
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_AcceptAdminRole')
// The root derives the token entry and forwards the sender as its actor.
type AcceptAdminRole struct {
	_            tlb.Magic        `tlb:"#be28e166" json:"-"` //nolint:revive
	QueryID      uint64           `tlb:"## 64"`
	TokenAddress *address.Address `tlb:"addr"`
}

// The following messages are sent by a deterministic entry to this root and
// emitted externally after the root validates the entry address.
// crc32('TokenAdminRegistry_AdministratorTransferRequested')
type AdministratorTransferRequested struct {
	_                    tlb.Magic        `tlb:"#140b1e91" json:"-"` //nolint:revive
	QueryID              uint64           `tlb:"## 64"`
	Token                *address.Address `tlb:"addr"`
	CurrentAdministrator *address.Address `tlb:"addr"`
	NewAdministrator     *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_AdministratorTransferred')
type AdministratorTransferred struct {
	_                tlb.Magic        `tlb:"#e2c74db4" json:"-"` //nolint:revive
	QueryID          uint64           `tlb:"## 64"`
	Token            *address.Address `tlb:"addr"`
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_PoolSet')
type PoolSet struct {
	_            tlb.Magic        `tlb:"#cef01a87" json:"-"` //nolint:revive
	QueryID      uint64           `tlb:"## 64"`
	Token        *address.Address `tlb:"addr"`
	PreviousPool *address.Address `tlb:"addr"`
	NewPool      *address.Address `tlb:"addr"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	SetEntryDeployment{},
	RegisterToken{},
	OverridePendingAdministrator{},
	TransferAdminRole{},
	AcceptAdminRole{},
	AdministratorTransferRequested{},
	AdministratorTransferred{},
	PoolSet{},
}).MustWithStorageType(Storage{})
