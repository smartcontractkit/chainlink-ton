package ccipsendexecutor

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// CCIPSend Executor opcodes
const (
	OpcodeCCIPSendExecutorExecute                 = 0xAF3C62B3 // crc32('CCIPSendExecutor_Execute')
	OpcodeCCIPSendExecutorMessageValidated        = 0xCBC4AF76 // crc32('CCIPSendExecutor_MessageValidated'
	OpcodeCCIPSendExecutorMessageValidationFailed = 0x0F756150 // crc32('CCIPSendExecutor_MessageValidationFailed')
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	return tvm.NewExitCodeInSet(ExitCode(ec), []ExitCode{
		ErrorUnauthorized,
		ErrorStateNotExpected,
		InsufficientFee,
	})
}

// CCIPSend Executor exit codes
const (
	ErrorUnauthorized     ExitCode = 265 // ERROR_UNAUTHORIZED from contract
	ErrorStateNotExpected ExitCode = 500
	InsufficientFee       ExitCode = 43602 // TODO this error codes are outdated
)

// CCIPSendExecutor_Execute message structure
type Execute struct {
	_          tlb.Magic   `tlb:"#AF3C62B3"` //nolint:revive // Ignore opcode tag
	OnRampSend onramp.Send `tlb:"."`
	Config     *cell.Cell  `tlb:"^"`
}

// CCIPSendExecutor_MessageValidated message structure
type MessageValidated struct {
	_        tlb.Magic        `tlb:"#cbc4af76"` //nolint:revive // Ignore opcode tag
	Msg      *router.CCIPSend `tlb:"^"`
	Metadata *cell.Cell       `tlb:"^"`
	Fee      *tlb.Coins       `tlb:"."`
}

type MessageValidationFailed struct {
	_        tlb.Magic        `tlb:"#0f756150"` //nolint:revive // Ignore opcode tag
	Msg      *router.CCIPSend `tlb:"^"`
	Metadata *cell.Cell       `tlb:"^"`
	Reason   string           `tlb:"str"`
}

// Metadata structure
type Metadata struct {
	Sender *address.Address `tlb:"addr"`
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
	Amount *big.Int         `tlb:"## 256"`
	Token  *address.Address `tlb:"addr"`
}
