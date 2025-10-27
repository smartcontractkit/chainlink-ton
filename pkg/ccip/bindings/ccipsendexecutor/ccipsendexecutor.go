package ccipsendexecutor

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
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
	return tvm.NewExitCodeInSet(ExitCode(ec), []ExitCode{
		ErrorUnauthorized,
		ErrorStateNotExpected,
	})
}

// CCIPSend Executor exit codes
const (
	ErrorUnauthorized     ExitCode = 265 // ERROR_UNAUTHORIZED from contract
	ErrorStateNotExpected ExitCode = 500
)

// CCIPSendExecutor_Execute message structure
type Execute struct {
	_                  tlb.Magic        `tlb:"#AF3C62B3"` //nolint:revive // Ignore opcode tag
	OnRampSend         onramp.Send      `tlb:"."`
	Config             *cell.Cell       `tlb:"^"`
	OnRampJettonWallet *address.Address `tlb:"maybe addr"`
}

// Metadata structure
type Metadata struct {
	Sender *address.Address `tlb:"addr"`
}

// CCIPSendExecutor_Config structure
type Config struct {
	FeeQuoter     *address.Address `tlb:"addr"`
	TokenRegistry *address.Address `tlb:"maybe addr"`
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
	TokenRegistry *address.Address `tlb:"maybe addr"`
}

type StateWaitingForJettons struct {
	TokenRegistry *address.Address `tlb:"addr"`
}

type StateOnGoingFeeValidation struct {
	PendingJettonLock *PendingJettonLock `tlb:"maybe ."`
}

type PendingJettonLock struct {
	TokenRegistry *address.Address `tlb:"addr"`
	JettonWallet  *address.Address `tlb:"addr"`
	TokenPool     *address.Address `tlb:"addr"`
}

// OnRamp message types that the executor sends back
type OnRampWithdrawJettons struct {
	MsgID              *big.Int                     `tlb:"## 224"`
	Tokens             common.SnakeRef[TokenAmount] `tlb:"^"`
	OnRampJettonWallet *address.Address             `tlb:"addr"`
}

type OnRampExecutorFinishedSuccessfully struct {
	MsgID    *big.Int   `tlb:"## 224"`
	Msg      *cell.Cell `tlb:"^"`
	Metadata Metadata   `tlb:"."`
	Fee      tlb.Coins  `tlb:"."`
}

// TokenAmount structure (reused from router package concept)
type TokenAmount struct {
	Amount *big.Int         `tlb:"## 256"`
	Token  *address.Address `tlb:"addr"`
}
