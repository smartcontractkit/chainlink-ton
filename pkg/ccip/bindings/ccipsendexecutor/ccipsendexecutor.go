package ccipsendexecutor

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// CCIPSend Executor opcodes
const (
	OpcodeCCIPSendExecutorExecute          = 0xAF3C62B3 // crc32('CCIPSendExecutor_Execute')
	OpcodeFeeQuoterMessageValidated        = 0x1fa60374 // crc32('FeeQuoter_MessageValidated')
	OpcodeFeeQuoterMessageValidationFailed = 0xbcf0ab0f // crc32('FeeQuoter_MessageValidationFailed')
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorStateNotExpected)
		ecMax = int32(ErrorInsufficientFee)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

// CCIPSend Executor exit codes
const (
	ErrorStateNotExpected ExitCode = iota + 43600
	ErrorUnauthorized
	ErrorInsufficientFunds
	ErrorInsufficientFee
)

// CCIPSendExecutor_Execute message structure
type Execute struct {
	_          tlb.Magic   `tlb:"#AF3C62B3"` //nolint:revive // Ignore opcode tag
	OnRampSend onramp.Send `tlb:"."`
	Config     *cell.Cell  `tlb:"^"`
}

// FeeQuoter_MessageValidated message structure
type MessageValidated struct {
	_        tlb.Magic        `tlb:"#cbc4af76"` //nolint:revive // Ignore opcode tag
	Fee      *tlb.Coins       `tlb:"."`
	Msg      *router.CCIPSend `tlb:"^"`
	Metadata *cell.Cell       `tlb:"^"`
}

// FeeQuoter_MessageValidationFailed message structure
type MessageValidationFailed struct {
	_       tlb.Magic        `tlb:"#0f756150"` //nolint:revive // Ignore opcode tag
	Error   big.Int          `tlb:"."`
	Msg     *router.CCIPSend `tlb:"^"`
	Context *cell.Cell       `tlb:"^"`
}

var TLBs = lib.MustNewTLBMap([]any{
	Execute{},
	MessageValidated{},
	MessageValidationFailed{},
	// Note: We don't handle JettonTransferNotification or FeeQuoter_MessageValidated here
	// because they are already handled by their respective decoders (jetton wallet and fee quoter)
})

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
	Amount *big.Int         `tlb:"## 256"`
	Token  *address.Address `tlb:"addr"`
}
