// Package tokenadminregistryentry contains the ABI binding for a deterministic
// per-token TokenAdminRegistryEntry shard.
package tokenadminregistryentry

import (
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/versioning/upgradeable"
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
	TokenInfo    TokenInfo        `tlb:"^"`
	AdminConfig  AdminConfig      `tlb:"^"`
	// Enabled is set once the token answers a TEP-89 query with a wallet.
	Enabled bool `tlb:"bool"`
}

type TokenInfo struct {
	TokenPool *address.Address `tlb:"addr"`
	// TransferInitiator of the jetton transfers delivering a release/mint; nil means the pool itself.
	TransferInitiator *address.Address `tlb:"addr"`
	MinterAddress     *address.Address `tlb:"addr"`
	Version           uint32           `tlb:"## 32"`
}

type AdminConfig struct {
	TokenAdminRegistry   *address.Address `tlb:"addr"`
	Administrator        *address.Address `tlb:"addr"`
	PendingAdministrator *address.Address `tlb:"addr"`
}

// RootMessage is the set of messages the root sends wrapped in MessageFromRoot.
type RootMessage interface {
	GetTokenInfo |
		ProposeAdministrator |
		TransferAdminRole |
		AcceptAdminRole |
		SetPool |
		VerifyToken
}

// crc32('TokenAdminRegistryEntry_MessageFromRoot')
// Envelope for every message the root sends to an entry.
type MessageFromRoot[T RootMessage | any] struct {
	_               tlb.Magic                 `tlb:"#558e7559" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID         uint64                    `tlb:"## 64"`
	MinEntryVersion uint16                    `tlb:"## 16"`
	Content         *codec.MessageEnvelope[T] `tlb:"^"`
}

// crc32('TokenAdminRegistryEntry_GetTokenInfo')
// Sent by the root on behalf of Requester.
type GetTokenInfo struct {
	_         tlb.Magic        `tlb:"#7aef4c2d" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Token     *address.Address `tlb:"addr"`
	Requester *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_TokenInfo')
// Entry answer relayed to Requester after the root validates the entry address.
// Named TokenInfoResponse because TokenInfo is the stored token info struct.
type TokenInfoResponse struct {
	_         tlb.Magic        `tlb:"#4e1c9ad5" json:"-"` //nolint:revive // used by tlb reflection for encoding
	QueryID   uint64           `tlb:"## 64"`
	Token     *address.Address `tlb:"addr"`
	Requester *address.Address `tlb:"addr"`
	TokenInfo TokenInfo        `tlb:"^"`
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
	_                 tlb.Magic        `tlb:"#a64e05c9" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Actor             *address.Address `tlb:"addr"`
	TokenPool         *address.Address `tlb:"addr"`
	TransferInitiator *address.Address `tlb:"addr"`
}

// crc32('TokenAdminRegistryEntry_VerifyToken')
type VerifyToken struct {
	_ tlb.Magic `tlb:"#a14b0288" json:"-"` //nolint:revive // used by tlb reflection for encoding
}

// crc32('TokenAdminRegistryEntry_Resume')
// Sent by the root right after an Upgrade to replay a deferred request.
type Resume struct {
	_       tlb.Magic            `tlb:"#47d63a64" json:"-"` //nolint:revive // used by tlb reflection for encoding
	Request MessageFromRoot[any] `tlb:"^"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	RegistrationInitialized{},
	MessageFromRoot[any]{Content: nil},
	GetTokenInfo{},
	TokenInfoResponse{},
	ProposeAdministrator{},
	TransferAdminRole{},
	AcceptAdminRole{},
	SetPool{},
	VerifyToken{},
	upgradeable.Upgrade{},
	Resume{},
}).MustWithStorageType(Storage{})
