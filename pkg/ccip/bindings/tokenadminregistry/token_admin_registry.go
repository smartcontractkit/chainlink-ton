// Package tokenadminregistry contains the ABI binding for the standalone
// TokenAdminRegistry root contract.
package tokenadminregistry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenadminregistryentry"
)

var (
	OpcodeRegisterToken                = tvm.MustExtractMagic(reflect.TypeFor[RegisterToken]())
	OpcodeOverridePendingAdministrator = tvm.MustExtractMagic(reflect.TypeFor[OverridePendingAdministrator]())
)

type Storage struct {
	ID      uint32               `tlb:"## 32"`
	Ownable ownable2step.Storage `tlb:"."`
}

// crc32('TokenAdminRegistry_RegisterToken')
type RegisterToken struct {
	_             tlb.Magic                         `tlb:"#9ab89f26" json:"-"` //nolint:revive // used by tlb reflection for encoding
	TokenAddress  *address.Address                  `tlb:"addr"`
	TokenInfo     tokenadminregistryentry.TokenInfo `tlb:"^"`
	Administrator *address.Address                  `tlb:"addr"`
}

// crc32('TokenAdminRegistry_OverridePendingAdministrator')
type OverridePendingAdministrator struct {
	_             tlb.Magic        `tlb:"#6e6f71ef" json:"-"` //nolint:revive // used by tlb reflection for encoding
	TokenAddress  *address.Address `tlb:"addr"`
	Administrator *address.Address `tlb:"addr"`
}

// The following messages are sent by a deterministic entry to this root and
// emitted externally after the root validates the entry address.
// crc32('TokenAdminRegistry_AdministratorTransferRequested')
type AdministratorTransferRequested struct {
	_                    tlb.Magic        `tlb:"#140b1e91" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Token                *address.Address `tlb:"addr"`
	CurrentAdministrator *address.Address `tlb:"addr"`
	NewAdministrator     *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_AdministratorTransferred')
type AdministratorTransferred struct {
	_                tlb.Magic        `tlb:"#e2c74db4" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Token            *address.Address `tlb:"addr"`
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistry_PoolSet')
type PoolSet struct {
	_               tlb.Magic        `tlb:"#cef01a87" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Token           *address.Address `tlb:"addr"`
	PreviousPool    *address.Address `tlb:"addr"`
	NewPool         *address.Address `tlb:"addr"`
	PreviousEnabled bool             `tlb:"bool"`
	NewEnabled      bool             `tlb:"bool"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	RegisterToken{},
	OverridePendingAdministrator{},
	AdministratorTransferRequested{},
	AdministratorTransferred{},
	PoolSet{},
}).MustWithStorageType(Storage{})
