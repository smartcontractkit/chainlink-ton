package tokenpool

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Primitives / Wrappers ---

// ChainSelector is a wrapper for uint64 to support SnakedCell encoding.
type ChainSelector struct {
	Value uint64 `tlb:"## 64"`
}

// --- Constants ---

const (
	WaitForFinalityFlag = 0
	DefaultFinality     = WaitForFinalityFlag
	BPSDivider          = 10000
)

// --- Data types (no opcodes) ---

// DynamicConfig holds the router and admin addresses for the pool.
type DynamicConfig struct {
	Router         *address.Address `tlb:"addr"`
	RateLimitAdmin *address.Address `tlb:"addr"`
	FeeAdmin       *address.Address `tlb:"addr"`
}

// MirroredPolicy holds on/off ramp addresses and cursed subjects.
type MirroredPolicy struct {
	OnRamps        *tlbe.Dict[uint64, *address.Address] `tlb:"."`
	OffRamps       *tlbe.Dict[uint64, *address.Address] `tlb:"."`
	CursedSubjects CursedSubjects                       `tlb:"."`
}

// CursedSubjects represents the set of cursed subjects (uint128 keys with empty values).
type CursedSubjects struct {
	Data *tlbe.Dict[*big.Int, bool] `tlb:"dict 128"` // TODO: fix me
}

// RampUpdate represents a single ramp access update for a remote chain.
type RampUpdate struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	OnRamp              *address.Address `tlb:"addr"`
	OffRamp             *address.Address `tlb:"addr"`
}

// RateLimitConfig represents a rate limiter configuration.
type RateLimitConfig struct {
	IsEnabled bool     `tlb:"bool"`
	Capacity  *big.Int `tlb:"## 128"`
	Rate      *big.Int `tlb:"## 128"`
}

// RateLimitConfigPair holds outbound and inbound rate limit configurations.
type RateLimitConfigPair struct {
	Outbound RateLimitConfig `tlb:"^"`
	Inbound  RateLimitConfig `tlb:"^"`
}

// RateLimiterTokenBucket represents the token bucket rate limiter state.
type RateLimiterTokenBucket struct {
	Tokens      *big.Int `tlb:"## 128"`
	LastUpdated uint64   `tlb:"## 64"`
	IsEnabled   bool     `tlb:"bool"`
	Capacity    *big.Int `tlb:"## 128"`
	Rate        *big.Int `tlb:"## 128"`
}

// RateLimiterPair holds outbound and inbound rate limiter token buckets.
type RateLimiterPair struct {
	Outbound RateLimiterTokenBucket `tlb:"^"`
	Inbound  RateLimiterTokenBucket `tlb:"^"`
}

// ChainUpdate represents a chain update with remote pool addresses and token info.
type ChainUpdate struct {
	RemoteChainSelector uint64                                      `tlb:"## 64"`
	RemotePoolAddresses common.SnakedCell[common.CrossChainAddress] `tlb:"^"`
	RemoteTokenAddress  *tlbe.Cell[common.CrossChainAddress]        `tlb:"^"`
	RateLimitConfigs    RateLimitConfigPair                         `tlb:"."`
}

// RemoteChainConfig holds the configuration for a remote chain.
type RemoteChainConfig struct {
	RemoteTokenAddress       *tlbe.Cell[common.CrossChainAddress]  `tlb:"."`
	RemotePools              *tlbe.Dict[*tlbe.Uint256, *cell.Cell] `tlb:"."`
	RateLimiters             RateLimiterPair                       `tlb:"^"`
	FastFinalityRateLimiters RateLimiterPair                       `tlb:"^"`
}

// RateLimitConfigArgs holds arguments for setting rate limit configs.
type RateLimitConfigArgs struct {
	RemoteChainSelector       uint64          `tlb:"## 64"`
	FastFinality              bool            `tlb:"bool"`
	OutboundRateLimiterConfig RateLimitConfig `tlb:"."`
	InboundRateLimiterConfig  RateLimitConfig `tlb:"."`
}

// TokenTransferFeeConfig holds the fee configuration for token transfers.
type TokenTransferFeeConfig struct {
	DestGasOverhead            uint32   `tlb:"## 32"`
	DestBytesOverhead          uint32   `tlb:"## 32"`
	FinalityFeeUSDCents        *big.Int `tlb:"."`
	FastFinalityFeeUSDCents    *big.Int `tlb:"."`
	FinalityTransferFeeBps     uint16   `tlb:"## 16"`
	FastFinalityTransferFeeBps uint16   `tlb:"## 16"`
	IsEnabled                  bool     `tlb:"bool"`
}

// TokenTransferFeeConfigArgs holds arguments for setting token transfer fee configs.
type TokenTransferFeeConfigArgs struct {
	DestChainSelector      uint64                 `tlb:"## 64"`
	TokenTransferFeeConfig TokenTransferFeeConfig `tlb:"."`
}

// TransferDetails holds the details of a token transfer.
// S = sender type (address for lock/burn, CrossChainAddress for release/mint)
// R = receiver type (CrossChainAddress for lock/burn, address for release/mint)
type LockOrBurnTransferDetails struct {
	Receiver            *cell.Cell       `tlb:"^"`
	RemoteChainSelector uint64           `tlb:"## 64"`
	OriginalSender      *address.Address `tlb:"addr"`
	Amount              *big.Int         `tlb:"."`
	LocalToken          *address.Address `tlb:"addr"`
}

type ReleaseOrMintTransferDetails struct {
	Receiver            *address.Address `tlb:"addr"`
	RemoteChainSelector uint64           `tlb:"## 64"`
	OriginalSender      *cell.Cell       `tlb:"^"`
	Amount              *big.Int         `tlb:"."`
	LocalToken          *address.Address `tlb:"addr"`
}

// LockOrBurnTransfer represents a lock/burn transfer.
type LockOrBurnTransfer struct {
	ID      *big.Int                   `tlb:"## 256"`
	Details *LockOrBurnTransferDetails `tlb:"^"`
}

// ReleaseOrMintTransfer represents a release/mint transfer.
type ReleaseOrMintTransfer struct {
	ID      *big.Int                      `tlb:"## 256"`
	Details *ReleaseOrMintTransferDetails `tlb:"^"`
}

// LockOrBurnInV1 holds the input data for a lock/burn operation.
type LockOrBurnInV1 struct {
	Transfer LockOrBurnTransfer `tlb:"."`
}

// LockOrBurnOutV1 holds the output data for a lock/burn operation.
type LockOrBurnOutV1 struct {
	DestTokenAddress common.CrossChainAddress `tlb:"^"`
	DestPoolData     *cell.Cell               `tlb:"^"`
}

// ReleaseOrMintInV1 holds the input data for a release/mint operation.
type ReleaseOrMintInV1 struct {
	Transfer          ReleaseOrMintTransfer    `tlb:"."`
	SourcePoolAddress common.CrossChainAddress `tlb:"^"`
	SourcePoolData    *cell.Cell               `tlb:"maybe ^"`
	OffchainTokenData *cell.Cell               `tlb:"maybe ^"`
}

// ReleaseOrMintOutV1 holds the output data for a release/mint operation.
type ReleaseOrMintOutV1 struct {
	DestinationAmount *big.Int `tlb:"## 256"`
}

// LockOrBurnPrepared holds the prepared data for a lock/burn operation.
type LockOrBurnPrepared struct {
	FeeAmount       *big.Int        `tlb:"## 256"`
	DestTokenAmount *big.Int        `tlb:"## 256"`
	Out             LockOrBurnOutV1 `tlb:"."`
}

// ReleaseOrMintPrepared holds the prepared data for a release/mint operation.
type ReleaseOrMintPrepared struct {
	RequestedFinalityConfig uint32             `tlb:"## 32"`
	LocalAmount             *big.Int           `tlb:"## 256"`
	Out                     ReleaseOrMintOutV1 `tlb:"."`
}

// LockOrBurnForwardPayload holds the forward payload for lock/burn operations.
type LockOrBurnForwardPayload struct {
	OriginalSender *address.Address   `tlb:"addr"`
	RequestMsg     LockOrBurn         `tlb:"^"`
	Prepared       LockOrBurnPrepared `tlb:"^"`
}

// ReleaseOrMintForwardPayload holds the forward payload for release/mint operations.
type ReleaseOrMintForwardPayload struct {
	OriginalSender *address.Address      `tlb:"addr"`
	RequestMsg     ReleaseOrMint         `tlb:"^"`
	Prepared       ReleaseOrMintPrepared `tlb:"^"`
}

// AdminConfig holds the admin configuration for the pool.
type AdminConfig struct {
	Ownable               ownable2step.Storage `tlb:"^"`
	RMNProxy              *address.Address     `tlb:"addr"`
	DynamicConfig         DynamicConfig        `tlb:"^"`
	AllowedFinalityConfig uint32               `tlb:"## 32"`
	AdvancedPoolHooks     *address.Address     `tlb:"addr"`
}

// Storage represents the TokenPool contract storage.
type Storage struct {
	AdminConfig             AdminConfig                                `tlb:"^"`
	MirroredPolicy          MirroredPolicy                             `tlb:"^"`
	Token                   *address.Address                           `tlb:"addr"`
	TokenDecimals           uint8                                      `tlb:"## 8"`
	RemoteChainConfigs      *tlbe.Dict[uint64, RemoteChainConfig]      `tlb:"dict 64"`
	TokenTransferFeeConfigs *tlbe.Dict[uint64, TokenTransferFeeConfig] `tlb:"dict 64"`
}

// --- Messages - incoming ---

// ApplyChainUpdates applies chain updates to the token pool.
type ApplyChainUpdates struct {
	_                            tlb.Magic                        `tlb:"#56f73d37" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID                      uint64                           `tlb:"## 64"`
	RemoteChainSelectorsToRemove common.SnakedCell[ChainSelector] `tlb:"^"`
	ChainsToAdd                  common.SnakedCell[ChainUpdate]   `tlb:"^"`
}

// AddRemotePool adds a remote pool for a given chain selector.
type AddRemotePool struct {
	_                   tlb.Magic                `tlb:"#17c242dc" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64                   `tlb:"## 64"`
	RemoteChainSelector uint64                   `tlb:"## 64"`
	RemotePoolAddress   common.CrossChainAddress `tlb:"^"`
}

// RemoveRemotePool removes a remote pool for a given chain selector.
type RemoveRemotePool struct {
	_                   tlb.Magic                `tlb:"#426b8cc4" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64                   `tlb:"## 64"`
	RemoteChainSelector uint64                   `tlb:"## 64"`
	RemotePoolAddress   common.CrossChainAddress `tlb:"^"`
}

// SetDynamicConfig sets the dynamic configuration for the pool.
type SetDynamicConfig struct {
	_              tlb.Magic        `tlb:"#d7712810" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64           `tlb:"## 64"`
	Router         *address.Address `tlb:"addr"`
	RateLimitAdmin *address.Address `tlb:"addr"`
	FeeAdmin       *address.Address `tlb:"addr"`
}

// SetAllowedFinalityConfig sets the finality config.
type SetAllowedFinalityConfig struct {
	_                     tlb.Magic `tlb:"#3c50a39b" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID               uint64    `tlb:"## 64"`
	AllowedFinalityConfig uint32    `tlb:"## 32"`
}

// SetAdvancedPoolHooks sets the advanced pool hooks address.
type SetAdvancedPoolHooks struct {
	_                 tlb.Magic        `tlb:"#3f5c9f57" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID           uint64           `tlb:"## 64"`
	AdvancedPoolHooks *address.Address `tlb:"addr"`
}

// SetRateLimitConfig sets the rate limit configurations.
type SetRateLimitConfig struct {
	_       tlb.Magic                              `tlb:"#4fe2d26c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64                                 `tlb:"## 64"`
	Updates common.SnakedCell[RateLimitConfigArgs] `tlb:"^"`
}

// ApplyTokenTransferFeeConfigUpdates applies token transfer fee config updates.
type ApplyTokenTransferFeeConfigUpdates struct {
	_                     tlb.Magic                                     `tlb:"#30a1d1f7" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID               uint64                                        `tlb:"## 64"`
	Updates               common.SnakedCell[TokenTransferFeeConfigArgs] `tlb:"^"`
	DisableChainSelectors common.SnakedCell[ChainSelector]              `tlb:"^"`
}

// UpdateRampAccess updates ramp access for chains.
type UpdateRampAccess struct {
	_       tlb.Magic                     `tlb:"#e30764be" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64                        `tlb:"## 64"`
	Updates common.SnakedCell[RampUpdate] `tlb:"^"`
}

// SetRMNProxy sets the RMN proxy address.
type SetRMNProxy struct {
	_        tlb.Magic        `tlb:"#9929b642" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID  uint64           `tlb:"## 64"`
	RMNProxy *address.Address `tlb:"addr"`
}

// SetCursedSubjects sets the cursed subjects list.
type SetCursedSubjects struct {
	_              tlb.Magic      `tlb:"#9da4da09" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64         `tlb:"## 64"`
	CursedSubjects CursedSubjects `tlb:"."`
}

// LockOrBurn locks tokens into the pool or burns the tokens.
type LockOrBurn struct {
	_                       tlb.Magic        `tlb:"#fa7da444" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID                 uint64           `tlb:"## 64"`
	Request                 LockOrBurnInV1   `tlb:"^"`
	RequestedFinalityConfig uint32           `tlb:"## 32"`
	TokenArgs               *cell.Cell       `tlb:"maybe ^"`
	ReplyTo                 *address.Address `tlb:"addr"`
}

// ReleaseOrMint releases or mints tokens on the destination chain.
type ReleaseOrMint struct {
	_                       tlb.Magic         `tlb:"#351f77e3" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID                 uint64            `tlb:"## 64"`
	Request                 ReleaseOrMintInV1 `tlb:"^"`
	RequestedFinalityConfig uint32            `tlb:"## 32"`
	ReplyTo                 *address.Address  `tlb:"addr"`
}

// PreflightCheckFinished notifies preflight check success.
type PreflightCheckFinished struct {
	_              tlb.Magic                `tlb:"#08f2ffb7" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64                   `tlb:"## 64"`
	ForwardPayload LockOrBurnForwardPayload `tlb:"^"`
}

// PreflightCheckFailed notifies preflight check failure.
type PreflightCheckFailed struct {
	_              tlb.Magic                `tlb:"#a6dfa623" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64                   `tlb:"## 64"`
	ForwardPayload LockOrBurnForwardPayload `tlb:"^"`
}

// PostflightCheckFinished notifies postflight check success.
type PostflightCheckFinished struct {
	_              tlb.Magic                   `tlb:"#9e2a6b66" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64                      `tlb:"## 64"`
	ForwardPayload ReleaseOrMintForwardPayload `tlb:"^"`
}

// PostflightCheckFailed notifies postflight check failure.
type PostflightCheckFailed struct {
	_              tlb.Magic                   `tlb:"#21e71d87" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64                      `tlb:"## 64"`
	ForwardPayload ReleaseOrMintForwardPayload `tlb:"^"`
}

// PreflightCheck requests an async preflight check from the hooks contract.
type PreflightCheck struct {
	_                       tlb.Magic        `tlb:"#4129d109" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID                 uint64           `tlb:"## 64"`
	Request                 LockOrBurnInV1   `tlb:"^"`
	RequestedFinalityConfig uint32           `tlb:"## 32"`
	TokenArgs               *cell.Cell       `tlb:"maybe ^"`
	AmountPostFee           *big.Int         `tlb:"## 256"`
	ReplyTo                 *address.Address `tlb:"addr"`
	ReplyPayload            *cell.Cell       `tlb:"maybe ^"`
}

// PostflightCheck requests an async postflight check from the hooks contract.
type PostflightCheck struct {
	_                       tlb.Magic         `tlb:"#703c2b58" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID                 uint64            `tlb:"## 64"`
	Request                 ReleaseOrMintInV1 `tlb:"^"`
	LocalAmount             *big.Int          `tlb:"## 256"`
	RequestedFinalityConfig uint32            `tlb:"## 32"`
	ReplyTo                 *address.Address  `tlb:"addr"`
	ReplyPayload            *cell.Cell        `tlb:"maybe ^"`
}

// --- Messages - outgoing ---

// LockOrBurnWithdraw requests token withdrawal from the on-ramp.
type LockOrBurnWithdraw struct {
	_              tlb.Magic                `tlb:"#e7a35041" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64                   `tlb:"## 64"`
	ForwardPayload LockOrBurnForwardPayload `tlb:"."`
}

// LockOrBurnFinished notifies that a lock/burn operation finished.
type LockOrBurnFinished struct {
	_               tlb.Magic       `tlb:"#f432a4e3" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID         uint64          `tlb:"## 64"`
	Out             LockOrBurnOutV1 `tlb:"^"`
	DestTokenAmount *big.Int        `tlb:"## 256"`
}

// LockOrBurnFailure notifies that a lock/burn operation failed.
type LockOrBurnFailure struct {
	_         tlb.Magic `tlb:"#3476ea72" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID   uint64    `tlb:"## 64"`
	ErrorCode uint16    `tlb:"## 16"`
}

// ReleaseOrMintFinished notifies that a release/mint operation finished.
type ReleaseOrMintFinished struct {
	_       tlb.Magic          `tlb:"#e0e882f5" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64             `tlb:"## 64"`
	Out     ReleaseOrMintOutV1 `tlb:"^"`
}

// ReleaseOrMintFailure notifies that a release/mint operation failed.
type ReleaseOrMintFailure struct {
	_         tlb.Magic `tlb:"#ef0cb36e" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID   uint64    `tlb:"## 64"`
	ErrorCode uint16    `tlb:"## 16"`
}

// RemotePoolAddedNotification confirms a remote pool was added.
type RemotePoolAddedNotification struct {
	_                   tlb.Magic                `tlb:"#12cc4985" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64                   `tlb:"## 64"`
	RemoteChainSelector uint64                   `tlb:"## 64"`
	RemotePoolAddress   common.CrossChainAddress `tlb:"^"`
}

// RemotePoolRemovedNotification confirms a remote pool was removed.
type RemotePoolRemovedNotification struct {
	_                   tlb.Magic                `tlb:"#e17bf3cc" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64                   `tlb:"## 64"`
	RemoteChainSelector uint64                   `tlb:"## 64"`
	RemotePoolAddress   common.CrossChainAddress `tlb:"^"`
}

// FinalityConfigSet confirms the finality config was set.
type FinalityConfigSet struct {
	_                     tlb.Magic `tlb:"#426a713b" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID               uint64    `tlb:"## 64"`
	AllowedFinalityConfig uint32    `tlb:"## 32"`
}

// DynamicConfigSet confirms the dynamic config was set.
type DynamicConfigSet struct {
	_              tlb.Magic        `tlb:"#b735e30c" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64           `tlb:"## 64"`
	Router         *address.Address `tlb:"addr"`
	RateLimitAdmin *address.Address `tlb:"addr"`
	FeeAdmin       *address.Address `tlb:"addr"`
}

// RateLimitConfiguredNotification confirms rate limits were configured.
type RateLimitConfiguredNotification struct {
	_       tlb.Magic `tlb:"#dd7b0c71" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// RMNProxySet confirms the RMN proxy was set.
type RMNProxySet struct {
	_        tlb.Magic        `tlb:"#e5d08b2e" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID  uint64           `tlb:"## 64"`
	RMNProxy *address.Address `tlb:"addr"`
}

// CursedSubjectsSet confirms the cursed subjects were set.
type CursedSubjectsSet struct {
	_              tlb.Magic      `tlb:"#15800161" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64         `tlb:"## 64"`
	CursedSubjects CursedSubjects `tlb:"."`
}

// AdvancedPoolHooksSet confirms the advanced pool hooks were set.
type AdvancedPoolHooksSet struct {
	_                 tlb.Magic        `tlb:"#3c869d80" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID           uint64           `tlb:"## 64"`
	AdvancedPoolHooks *address.Address `tlb:"addr"`
}

// --- Events ---

// LockedOrBurnedDetails holds details of a locked/burned event.
type LockedOrBurnedDetails struct {
	Token  *address.Address `tlb:"addr"`
	Sender *address.Address `tlb:"addr"`
	Amount *big.Int         `tlb:"## 256"`
}

// LockedOrBurned is emitted when tokens are locked or burned.
type LockedOrBurned struct {
	RemoteChainSelector uint64                `tlb:"## 64"`
	Details             LockedOrBurnedDetails `tlb:"^"`
}

// ReleasedOrMintedDetails holds details of a released/minted event.
type ReleasedOrMintedDetails struct {
	Token     *address.Address `tlb:"addr"`
	Sender    *address.Address `tlb:"addr"`
	Amount    *big.Int         `tlb:"## 256"`
	Recipient *address.Address `tlb:"^"`
}

// ReleasedOrMinted is emitted when tokens are released or minted.
type ReleasedOrMinted struct {
	RemoteChainSelector uint64                  `tlb:"## 64"`
	Details             ReleasedOrMintedDetails `tlb:"^"`
}

// ChainAdded is emitted when a chain is added.
type ChainAdded struct {
	RemoteChainSelector uint64                   `tlb:"## 64"`
	RemoteTokenAddress  common.CrossChainAddress `tlb:"^"`
}

// ChainRemoved is emitted when a chain is removed.
type ChainRemoved struct {
	RemoteChainSelector uint64 `tlb:"## 64"`
}

// RemotePoolAdded is emitted when a remote pool is added.
type RemotePoolAdded struct {
	RemoteChainSelector uint64                   `tlb:"## 64"`
	RemotePoolAddress   common.CrossChainAddress `tlb:"^"`
}

// RemotePoolRemoved is emitted when a remote pool is removed.
type RemotePoolRemoved struct {
	RemoteChainSelector uint64                   `tlb:"## 64"`
	RemotePoolAddress   common.CrossChainAddress `tlb:"^"`
}

// RateLimitConfigured is emitted when rate limits are configured.
type RateLimitConfigured struct {
	Args RateLimitConfigArgs `tlb:"."`
}

// RampAccessUpdated is emitted when ramp access is updated.
type RampAccessUpdated struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	OnRamp              *address.Address `tlb:"addr"`
	OffRamp             *address.Address `tlb:"addr"`
}

// OutboundRateLimitConsumed is emitted when outbound rate-limit capacity is consumed.
type OutboundRateLimitConsumed struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              *big.Int         `tlb:"## 256"`
}

// InboundRateLimitConsumed is emitted when inbound rate-limit capacity is consumed.
type InboundRateLimitConsumed struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              *big.Int         `tlb:"## 256"`
}

// FastFinalityOutboundRateLimitConsumed is emitted when fast-finality outbound rate-limit capacity is consumed.
type FastFinalityOutboundRateLimitConsumed struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              *big.Int         `tlb:"## 256"`
}

// FastFinalityInboundRateLimitConsumed is emitted when fast-finality inbound rate-limit capacity is consumed.
type FastFinalityInboundRateLimitConsumed struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              *big.Int         `tlb:"## 256"`
}

// OutboundRateLimitRefunded is emitted when previously consumed outbound rate-limit capacity is refunded.
// TON-specific: no EVM equivalent (EVM reverts synchronously).
type OutboundRateLimitRefunded struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              *big.Int         `tlb:"## 256"`
}

// InboundRateLimitRefunded is emitted when previously consumed inbound rate-limit capacity is refunded.
// TON-specific: no EVM equivalent (EVM reverts synchronously).
type InboundRateLimitRefunded struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              *big.Int         `tlb:"## 256"`
}

// TokenTransferFeeConfigUpdated is emitted when a token transfer fee configuration is updated.
type TokenTransferFeeConfigUpdated struct {
	DestChainSelector      uint64                 `tlb:"## 64"`
	TokenTransferFeeConfig TokenTransferFeeConfig `tlb:"^"`
}

// TokenTransferFeeConfigDeleted is emitted when a token transfer fee configuration is deleted (disabled).
type TokenTransferFeeConfigDeleted struct {
	DestChainSelector uint64 `tlb:"## 64"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	// Incoming
	ApplyChainUpdates{},
	AddRemotePool{},
	RemoveRemotePool{},
	SetDynamicConfig{},
	SetAllowedFinalityConfig{},
	SetAdvancedPoolHooks{},
	SetRateLimitConfig{},
	ApplyTokenTransferFeeConfigUpdates{},
	UpdateRampAccess{},
	SetRMNProxy{},
	SetCursedSubjects{},
	LockOrBurn{},
	ReleaseOrMint{},
	PreflightCheckFinished{},
	PreflightCheckFailed{},
	PostflightCheckFinished{},
	PostflightCheckFailed{},
	// Outgoing
	LockOrBurnWithdraw{},
	LockOrBurnFinished{},
	LockOrBurnFailure{},
	ReleaseOrMintFinished{},
	ReleaseOrMintFailure{},
	RemotePoolAddedNotification{},
	RemotePoolRemovedNotification{},
	FinalityConfigSet{},
	DynamicConfigSet{},
	RateLimitConfiguredNotification{},
	RMNProxySet{},
	CursedSubjectsSet{},
	AdvancedPoolHooksSet{},
	// AdvancedPoolHooks outgoing (sent from TokenPool to hooks contract)
	PreflightCheck{},
	PostflightCheck{},
	// Events
	LockedOrBurned{},
	ReleasedOrMinted{},
	ChainAdded{},
	ChainRemoved{},
	RemotePoolAdded{},
	RemotePoolRemoved{},
	RateLimitConfigured{},
	RampAccessUpdated{},
	OutboundRateLimitConsumed{},
	InboundRateLimitConsumed{},
	FastFinalityOutboundRateLimitConsumed{},
	FastFinalityInboundRateLimitConsumed{},
	OutboundRateLimitRefunded{},
	InboundRateLimitRefunded{},
	TokenTransferFeeConfigUpdated{},
	TokenTransferFeeConfigDeleted{},
}).MustWithStorageType(Storage{})

// Opcode constants for events (CRC32 topics)
const (
	TopicLockedOrBurned                        = "TokenPool_LockedOrBurned"
	TopicReleasedOrMinted                      = "TokenPool_ReleasedOrMinted"
	TopicChainAdded                            = "TokenPool_ChainAdded"
	TopicChainRemoved                          = "TokenPool_ChainRemoved"
	TopicRemotePoolAdded                       = "TokenPool_RemotePoolAdded"
	TopicRemotePoolRemoved                     = "TokenPool_RemotePoolRemoved"
	TopicDynamicConfigSet                      = "TokenPool_DynamicConfigSet"
	TopicRampAccessUpdated                     = "TokenPool_RampAccessUpdated"
	TopicFinalityConfigSet                     = "TokenPool_FinalityConfigSet"
	TopicRateLimitConfigured                   = "TokenPool_RateLimitConfigured"
	TopicOutboundRateLimitConsumed             = "TokenPool_OutboundRateLimitConsumed"
	TopicInboundRateLimitConsumed              = "TokenPool_InboundRateLimitConsumed"
	TopicFastFinalityOutboundRateLimitConsumed = "TokenPool_FastFinalityOutboundRateLimitConsumed"
	TopicFastFinalityInboundRateLimitConsumed  = "TokenPool_FastFinalityInboundRateLimitConsumed"
	TopicOutboundRateLimitRefunded             = "TokenPool_OutboundRateLimitRefunded"
	TopicInboundRateLimitRefunded              = "TokenPool_InboundRateLimitRefunded"
	TopicTokenTransferFeeConfigUpdated         = "TokenPool_TokenTransferFeeConfigUpdated"
	TopicTokenTransferFeeConfigDeleted         = "TokenPool_TokenTransferFeeConfigDeleted"
)
