// Package tokenadminregistryentry contains the ABI binding for a deterministic
// per-token TokenAdminRegistryEntry shard.
package tokenadminregistryentry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

// Version is TokenAdminRegistryEntry_VERSION: the entry version the root
// declares as the minimum in its messages to entries.
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
// Public read answered by the entry's running code. CCIP resolves token info
// through the root instead (tokenadminregistry.GetTokenInfo).
type GetTokenInfo struct {
	_       tlb.Magic `tlb:"#7aef4c2d" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64    `tlb:"## 64"`
}

// RootMessage is the set of messages the root sends wrapped in MessageFromRoot.
type RootMessage interface {
	ResolveTokenInfo |
		ProposeAdministrator |
		TransferAdminRole |
		AcceptAdminRole |
		SetPool
}

// crc32('TokenAdminRegistryEntry_MessageFromRoot')
// Envelope for every message the root sends to an entry.
type MessageFromRoot[T RootMessage | any] struct {
	_               tlb.Magic                 `tlb:"#558e7559" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID         uint64                    `tlb:"## 64"`
	MinEntryVersion uint16                    `tlb:"## 16"`
	Content         *codec.MessageEnvelope[T] `tlb:"^"`
}

// crc32('TokenAdminRegistryEntry_ResolveTokenInfo')
// Sent by the root on behalf of Requester.
type ResolveTokenInfo struct {
	_         tlb.Magic        `tlb:"#4f60fff3" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Requester *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_RegistrationInitialized')
type RegistrationInitialized struct {
	_       tlb.Magic `tlb:"#31580269" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64    `tlb:"## 64"`
}

// crc32('TokenAdminRegistryEntry_ProposeAdministrator')
type ProposeAdministrator struct {
	_             tlb.Magic        `tlb:"#6dcbe573" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Administrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_TransferAdminRole')
type TransferAdminRole struct {
	_                tlb.Magic        `tlb:"#8b1503cf" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Actor            *address.Address `tlb:"addr"`
	NewAdministrator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_AcceptAdminRole')
type AcceptAdminRole struct {
	_     tlb.Magic        `tlb:"#39c6e872" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Actor *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_SetPool')
// Sent by the root, which forwards the original sender as Actor.
type SetPool struct {
	_         tlb.Magic        `tlb:"#a64e05c9" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Actor     *address.Address `tlb:"addr"`
	TokenPool *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_UpgradeAndResume')
type UpgradeAndResume struct {
	_       tlb.Magic             `tlb:"#1fa23ab9" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID uint64                `tlb:"## 64"`
	Code    *cell.Cell            `tlb:"^"`
	Request *MessageFromRoot[any] `tlb:"maybe ^"`
}

// crc32('TokenAdminRegistryEntry_Resume')
type Resume struct {
	_       tlb.Magic            `tlb:"#47d63a64" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Request MessageFromRoot[any] `tlb:"^"`
}

// crc32('TokenAdminRegistryEntry_ReturnTokenInfo')
type ReturnTokenInfo struct {
	_             tlb.Magic        `tlb:"#0a58e678" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID       uint64           `tlb:"## 64"`
	MinterAddress *address.Address `tlb:"addr"`
	TokenPool     *address.Address `tlb:"addr"`
	Version       uint32           `tlb:"## 32"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	GetTokenInfo{},
	RegistrationInitialized{},
	MessageFromRoot[any]{Content: nil},
	ResolveTokenInfo{},
	ProposeAdministrator{},
	TransferAdminRole{},
	AcceptAdminRole{},
	SetPool{},
	UpgradeAndResume{},
	Resume{},
	ReturnTokenInfo{},
}).MustWithStorageType(Storage{})
