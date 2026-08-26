package tokenpool

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
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
	Router                   *address.Address         `tlb:"addr"`
	RateLimitAdmin           *address.Address         `tlb:"addr"`
	FeeAdmin                 *address.Address         `tlb:"addr"`
	AllowedDepositNamespaces *tlbe.Dict[uint32, bool] `tlb:"."`
}

// MirroredPolicy holds on/off ramp addresses and cursed subjects.
//
// Dict fields use *cell.Dictionary rather than *tlbe.Dict: tonutils-go's tlb
// encoder (used to build init data for contract deploys, see
// deployment/utils/operation/deploy_ton_contract.go) type-asserts "dict N"
// fields directly to *cell.Dictionary and panics on any other type.
type MirroredPolicy struct {
	OnRamps        *cell.Dictionary `tlb:"dict 64"`
	OffRamps       *cell.Dictionary `tlb:"dict 64"`
	CursedSubjects CursedSubjects   `tlb:"."`
}

// CursedSubjects represents the set of cursed subjects (uint128 keys with empty values).
type CursedSubjects struct {
	Data *cell.Dictionary `tlb:"dict 128"`
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
	Capacity  *big.Int `tlb:"## 120"`
	Rate      *big.Int `tlb:"## 120"`
}

// RateLimitConfigPair holds outbound and inbound rate limit configurations.
type RateLimitConfigPair struct {
	Outbound RateLimitConfig `tlb:"^"`
	Inbound  RateLimitConfig `tlb:"^"`
}

// RateLimiterTokenBucket represents the token bucket rate limiter state.
//
// Widths must match RateLimiter_TokenBucket in
// contracts/contracts/ccip/pools/lib/rate_limiter.tolk: the bucket amounts are
// uint120 (not uint128) so that a bucket packs into a single cell.
type RateLimiterTokenBucket struct {
	Tokens      *big.Int `tlb:"## 120"`
	LastUpdated uint64   `tlb:"## 64"`
	IsEnabled   bool     `tlb:"bool"`
	Capacity    *big.Int `tlb:"## 120"`
	Rate        *big.Int `tlb:"## 120"`
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
	RateLimitConfigs    RateLimitConfigPair                         `tlb:"^"`
}

// RemoteChainConfig holds the configuration for a remote chain.
type RemoteChainConfig struct {
	RemoteTokenAddress       *tlbe.Cell[common.CrossChainAddress]  `tlb:"^"`
	RemotePools              *tlbe.Dict[*tlbe.Uint256, *cell.Cell] `tlb:"."`
	RateLimiters             RateLimiterPair                       `tlb:"^"`
	FastFinalityRateLimiters RateLimiterPair                       `tlb:"^"`
}

// RateLimitConfigArgs holds arguments for setting rate limit configs.
//
// Both configs are `Cell<RateLimiter_Config>` in Tolk, i.e. separate refs, not
// inlined into the args cell.
type RateLimitConfigArgs struct {
	RemoteChainSelector       uint64          `tlb:"## 64"`
	FastFinality              bool            `tlb:"bool"`
	OutboundRateLimiterConfig RateLimitConfig `tlb:"^"`
	InboundRateLimiterConfig  RateLimitConfig `tlb:"^"`
}

// TokenTransferFeeConfig holds the fee configuration for token transfers.
type TokenTransferFeeConfig struct {
	DestGasOverhead            uint32    `tlb:"## 32"`
	DestBytesOverhead          uint32    `tlb:"## 32"`
	FinalityFeeUSDCents        tlb.Coins `tlb:"."`
	FastFinalityFeeUSDCents    tlb.Coins `tlb:"."`
	FinalityTransferFeeBps     uint16    `tlb:"## 16"`
	FastFinalityTransferFeeBps uint16    `tlb:"## 16"`
	IsEnabled                  bool      `tlb:"bool"`
}

// TokenTransferFeeConfigArgs holds arguments for setting token transfer fee configs.
type TokenTransferFeeConfigArgs struct {
	DestChainSelector      uint64                 `tlb:"## 64"`
	TokenTransferFeeConfig TokenTransferFeeConfig `tlb:"."`
}

// TransferDetails holds the details of a token transfer.
// S = sender type (address for lock/burn, CrossChainAddress for release/mint)
// R = receiver type (CrossChainAddress for lock/burn, address for release/mint)
// Amount is `coins` for the lock/burn direction (source token decimals) and
// `uint256` for release/mint, mirroring TokenPool_Transfer's C type parameter.
type LockOrBurnTransferDetails struct {
	Receiver            *cell.Cell       `tlb:"^"`
	RemoteChainSelector uint64           `tlb:"## 64"`
	OriginalSender      *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
	LocalToken          *address.Address `tlb:"addr"`
}

type ReleaseOrMintTransferDetails struct {
	Receiver            *address.Address `tlb:"addr"`
	RemoteChainSelector uint64           `tlb:"## 64"`
	OriginalSender      *cell.Cell       `tlb:"^"`
	Amount              *big.Int         `tlb:"## 256"`
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
	DestinationAmount tlb.Coins `tlb:"."`
}

// LockOrBurnPrepared holds the prepared data for a lock/burn operation.
type LockOrBurnPrepared struct {
	FeeAmount       tlb.Coins       `tlb:"."`
	DestTokenAmount tlb.Coins       `tlb:"."`
	Out             LockOrBurnOutV1 `tlb:"."`
}

// ReleaseOrMintPrepared holds the prepared data for a release/mint operation.
type ReleaseOrMintPrepared struct {
	RequestedFinalityConfig uint32             `tlb:"## 32"`
	LocalAmount             tlb.Coins          `tlb:"."`
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

// JettonClient holds the pool's Jetton identity (master + wallet code). Single
// source of truth used to derive and authenticate the pool's own wallet.
type JettonClient struct {
	MasterAddress    *address.Address `tlb:"addr"`
	JettonWalletCode *cell.Cell       `tlb:"^"`
}

// AdminConfig holds the admin configuration for the pool.
type AdminConfig struct {
	Ownable               ownable2step.Storage `tlb:"^"`
	RMNProxy              *address.Address     `tlb:"addr"`
	DynamicConfig         DynamicConfig        `tlb:"^"`
	JettonClient          JettonClient         `tlb:"."`
	AllowedFinalityConfig uint32               `tlb:"## 32"`
	AdvancedPoolHooks     *address.Address     `tlb:"addr"`
	DeployableCode        *cell.Cell           `tlb:"maybe ^"`
}

// Storage represents the TokenPool_Data storage layout shared by every TokenPool
// implementation (Mock, BurnMint, LockRelease, ...), each of which wraps it as
// `poolData: Cell<TokenPool_Data>` alongside its own pool-specific fields.
type Storage struct {
	AdminConfig             AdminConfig      `tlb:"^"`
	MirroredPolicy          MirroredPolicy   `tlb:"^"`
	TokenDecimals           uint8            `tlb:"## 8"`
	RemoteChainConfigs      *cell.Dictionary `tlb:"dict 64"`
	TokenTransferFeeConfigs *cell.Dictionary `tlb:"dict 64"`
}

// MockStorage represents the ccip.test.MockTokenPool contract storage
// (contracts/contracts/ccip/test/tokenPool/contract.tolk), which holds the shared
// TokenPool_Data behind a ref and adds no pool-specific state of its own.
//
// Deploying with a bare Storage instead of this wrapper produces a data cell whose
// refs are [adminConfig, mirroredPolicy] rather than [poolData], so the first
// handler that touches storage fails with exit code 9.
type MockStorage struct {
	PoolData Storage `tlb:"^"`
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

// SetDeployableCode sets the Compiled Deployable code used to derive source-chain deposit accounts.
type SetDeployableCode struct {
	_              tlb.Magic  `tlb:"#6c2a91e4" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64     `tlb:"## 64"`
	DeployableCode *cell.Cell `tlb:"maybe ^"`
}

// SetAllowedDepositNamespaces sets the Deployables namespaces the pool accepts as deposit sources.
type SetAllowedDepositNamespaces struct {
	_                        tlb.Magic                `tlb:"#1f8e33c2" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID                  uint64                   `tlb:"## 64"`
	AllowedDepositNamespaces *tlbe.Dict[uint32, bool] `tlb:"."`
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
	AmountPostFee           tlb.Coins        `tlb:"."`
	ReplyTo                 *address.Address `tlb:"addr"`
	ReplyPayload            *cell.Cell       `tlb:"maybe ^"`
}

// PostflightCheck requests an async postflight check from the hooks contract.
type PostflightCheck struct {
	_                       tlb.Magic         `tlb:"#703c2b58" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID                 uint64            `tlb:"## 64"`
	Request                 ReleaseOrMintInV1 `tlb:"^"`
	LocalAmount             tlb.Coins         `tlb:"."`
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
	DestTokenAmount tlb.Coins       `tlb:"."`
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

// ChainUpdatesApplied is replied on ApplyChainUpdates to confirm the tx and return excess.
type ChainUpdatesApplied struct {
	_       tlb.Magic `tlb:"#ad7833d7" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// RampAccessUpdatesApplied is replied on UpdateRampAccess to confirm the tx and return excess.
type RampAccessUpdatesApplied struct {
	_       tlb.Magic `tlb:"#d7f5c563" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// FeeConfigApplied is replied on ApplyTokenTransferFeeConfigUpdates to confirm the tx
// and return excess.
type FeeConfigApplied struct {
	_       tlb.Magic `tlb:"#28cbcc64" json:"-"` //nolint:revive // (opcode) should stay uninitialized
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

// DeployableCodeSet confirms the deployable code was set.
type DeployableCodeSet struct {
	_              tlb.Magic  `tlb:"#09d4a7b1" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64     `tlb:"## 64"`
	DeployableCode *cell.Cell `tlb:"maybe ^"`
}

// AllowedDepositNamespacesSet confirms the allowed deposit namespaces were set.
type AllowedDepositNamespacesSet struct {
	_       tlb.Magic `tlb:"#7a53c9f4" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// --- Events ---

// LockedOrBurnedDetails holds details of a locked/burned event.
type LockedOrBurnedDetails struct {
	Token  *address.Address `tlb:"addr"`
	Sender *address.Address `tlb:"addr"`
	Amount tlb.Coins        `tlb:"."`
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
	Amount    tlb.Coins        `tlb:"."`
	Recipient *address.Address `tlb:"^ addr"` // Cell<address> in Tolk: an address inside a ref
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
	Amount              tlb.Coins        `tlb:"."`
}

// InboundRateLimitConsumed is emitted when inbound rate-limit capacity is consumed.
type InboundRateLimitConsumed struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
}

// FastFinalityOutboundRateLimitConsumed is emitted when fast-finality outbound rate-limit capacity is consumed.
type FastFinalityOutboundRateLimitConsumed struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
}

// FastFinalityInboundRateLimitConsumed is emitted when fast-finality inbound rate-limit capacity is consumed.
type FastFinalityInboundRateLimitConsumed struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
}

// OutboundRateLimitRefunded is emitted when previously consumed outbound rate-limit capacity is refunded.
// TON-specific: no EVM equivalent (EVM reverts synchronously).
type OutboundRateLimitRefunded struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
}

// InboundRateLimitRefunded is emitted when previously consumed inbound rate-limit capacity is refunded.
// TON-specific: no EVM equivalent (EVM reverts synchronously).
type InboundRateLimitRefunded struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
}

// FastFinalityOutboundRateLimitRefunded is emitted when previously consumed fast-finality
// outbound rate-limit capacity is refunded.
// TON-specific: no EVM equivalent (EVM reverts synchronously).
type FastFinalityOutboundRateLimitRefunded struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
}

// FastFinalityInboundRateLimitRefunded is emitted when previously consumed fast-finality
// inbound rate-limit capacity is refunded.
// TON-specific: no EVM equivalent (EVM reverts synchronously).
type FastFinalityInboundRateLimitRefunded struct {
	RemoteChainSelector uint64           `tlb:"## 64"`
	Token               *address.Address `tlb:"addr"`
	Amount              tlb.Coins        `tlb:"."`
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
	SetDeployableCode{},
	SetAllowedDepositNamespaces{},
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
	DeployableCodeSet{},
	AllowedDepositNamespacesSet{},
	ChainUpdatesApplied{},
	RampAccessUpdatesApplied{},
	FeeConfigApplied{},
	// AdvancedPoolHooks outgoing (sent from TokenPool to hooks contract)
	PreflightCheck{},
	PostflightCheck{},
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
	TopicFastFinalityOutboundRateLimitRefunded = "TokenPool_FastFinalityOutboundRateLimitRefunded"
	TopicFastFinalityInboundRateLimitRefunded  = "TokenPool_FastFinalityInboundRateLimitRefunded"
	TopicTokenTransferFeeConfigUpdated         = "TokenPool_TokenTransferFeeConfigUpdated"
	TopicTokenTransferFeeConfigDeleted         = "TokenPool_TokenTransferFeeConfigDeleted"
)
