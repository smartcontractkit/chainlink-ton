package ccipsendexecutor

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// CCIPSend Executor opcodes
const (
	OpcodeCCIPSendExecutorExecute = 0xAF3C62B3 // crc32('CCIPSendExecutor_Execute')
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
type Execute struct {
	_          tlb.Magic   `tlb:"#AF3C62B3" json:"-"` //nolint:revive // Ignore opcode tag
	OnRampSend onramp.Send `tlb:"."`
	Config     *cell.Cell  `tlb:"^"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	Execute{},
}).MustWithStorageType(InitialData{})

// Metadata structure
type Metadata struct {
	Sender *address.Address `tlb:"addr"`
	Value  *tlb.Coins       `tlb:"."`
}

// CCIPSendExecutor_Config structure
type Config struct {
	FeeQuoter *address.Address `tlb:"addr"`
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
}

// State structures
type StateInitialized struct {
}

type StateOnGoingFeeValidation struct {
}

// TokenAmount structure (reused from router package concept)
type TokenAmount struct {
	Amount *tlb.Coins       `tlb:"."`
	Token  *address.Address `tlb:"addr"`
}
