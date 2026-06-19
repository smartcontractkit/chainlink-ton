package ccipsendexecutor

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// CCIPSend Executor opcodes
const (
	OpcodeCCIPSendExecutorExecute   = 0xAF3C62B3 // crc32('CCIPSendExecutor_Execute')
	OpcodeCCIPSendExecutorExecuteV2 = 0x09BBEB9E // crc32('CCIPSendExecutor_ExecuteV2')
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorStateNotExpected)
		ecMax = int32(ErrorFeeQuoterBounce)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

// CCIPSend Executor exit codes
const (
	ErrorStateNotExpected ExitCode = iota + 17800 // (crc32(<facility>) % 640) + 10
	ErrorUnauthorized
	ErrorInsufficientFunds
	ErrorInsufficientFee
	ErrorFeeQuoterBounce
)

// CCIPSendExecutor_Execute message structure
//
// Deprecated: superseded by ExecuteV2 (kept for backwards compatibility during the
// token-transfer rollout). Its config (Config) has no tokenRegistry.
type Execute struct {
	_          tlb.Magic   `tlb:"#AF3C62B3" json:"-"` //nolint:revive // Ignore opcode tag
	OnRampSend onramp.Send `tlb:"."`
	Config     *cell.Cell  `tlb:"^"`
}

// CCIPSendExecutor_ExecuteV2 message structure. Carries a ConfigV2 that may include a tokenRegistry.
type ExecuteV2 struct {
	_          tlb.Magic   `tlb:"#09BBEB9E" json:"-"` //nolint:revive // Ignore opcode tag
	OnRampSend onramp.Send `tlb:"."`
	Config     *cell.Cell  `tlb:"^"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	Execute{},
	ExecuteV2{},
}).MustWithStorageType(InitialData{})

// Metadata structure
type Metadata struct {
	Sender *address.Address `tlb:"addr"`
	Value  *tlb.Coins       `tlb:"."`
}

// CCIPSendExecutor_Config structure.
//
// Deprecated: used by the V1 Execute message. Use ConfigV2 (carries tokenRegistry) with ExecuteV2.
type Config struct {
	FeeQuoter *address.Address `tlb:"addr"`
}

// CCIPSendExecutor_ConfigV2 structure, used by ExecuteV2.
type ConfigV2 struct {
	FeeQuoter *address.Address `tlb:"addr"`
	// Optional (address?): addr_none when the send carries no token transfers.
	TokenRegistry *address.Address `tlb:"addr"`
}

// Initial data structure for CCIPSend Executor
type InitialData struct {
	OnRamp    *address.Address `tlb:"addr"`
	MessageID *big.Int         `tlb:"## 224"`
}

// Addresses structure
type Addresses struct {
	OnRamp    *address.Address `tlb:"addr"`
	FeeQuoter *address.Address `tlb:"addr"`
	// Optional (address?): addr_none when the send carries no token transfers.
	TokenRegistry *address.Address `tlb:"addr"`
}

// State structures
type StateInitialized struct {
}

type StateOnGoingFeeValidation struct {
}

type StateTokenRegistryAccess struct {
	Fee feequoter.Fee `tlb:"."`
}

type StateTokenTransfer struct {
	TokenPool *address.Address `tlb:"addr"`
	Fee       feequoter.Fee    `tlb:"."`
}

type StateFinalized struct {
}

// TokenAmount structure (reused from router package concept)
type TokenAmount struct {
	Amount *tlb.Coins       `tlb:"."`
	Token  *address.Address `tlb:"addr"`
}
