package wallet

import (
	"fmt"
	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

// JettonWallet opcodes
const (
	OpcodeWalletTransfer             = 0x0f8a7ea5
	OpcodeWalletTransferNotification = 0x7362d09c
	OpcodeWalletInternalTransfer     = 0x178d4519
	OpcodeWalletExcesses             = 0xd53276db
	OpcodeWalletBurn                 = 0x595f07bc
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(BalanceError)
		ecMax = int32(InvalidMessage)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	BalanceError ExitCode = iota + 47
	NotEnoughGas
	InvalidMessage
)

type AskToTransfer struct {
	_                   tlb.Magic        `tlb:"#0f8a7ea5"` //nolint:revive // (opcode) should stay uninitialized
	QueryID             uint64           `tlb:"## 64"`
	Amount              tlb.Coins        `tlb:"."`
	Destination         *address.Address `tlb:"addr"`
	ResponseDestination *address.Address `tlb:"addr"`
	CustomPayload       *cell.Cell       `tlb:"either . ^"`
	ForwardTonAmount    tlb.Coins        `tlb:"."`
	ForwardPayload      *cell.Cell       `tlb:"either . ^"`
}

type InternalTransferMessage struct {
	_                tlb.Magic        `tlb:"#178d4519"` //nolint:revive // (opcode) should stay uninitialized
	QueryID          uint64           `tlb:"## 64"`
	Amount           tlb.Coins        `tlb:"."`
	From             *address.Address `tlb:"addr"`
	ResponseAddress  *address.Address `tlb:"addr"`
	ForwardTonAmount tlb.Coins        `tlb:"."`
	ForwardPayload   *cell.Cell       `tlb:"either . ^"`
}

type TransferNotification struct {
	_              tlb.Magic        `tlb:"#7362d09c"` //nolint:revive // Ignore opcode tag
	QueryID        uint64           `tlb:"## 64"`
	Amount         tlb.Coins        `tlb:"^"`
	Sender         *address.Address `tlb:"addr"`
	ForwardPayload *cell.Cell       `tlb:"maybe ^"`
}

var TLBs = lib.MustNewTLBMap([]any{
	AskToTransfer{},
	InternalTransferMessage{},
	TransferNotification{},
})

var WalletContractPath = path.Join(jetton.PathToContracts, "JettonWallet.compiled.json")

type Provider struct {
	MinterAddress *address.Address
}

func NewWalletProvider(minterAddress *address.Address) *Provider {
	return &Provider{
		MinterAddress: minterAddress,
	}
}

type InitData struct {
	Status        uint8            `tlb:"## 4"`
	Balance       tlb.Coins        `tlb:"."`
	OwnerAddress  *address.Address `tlb:"addr"`
	MasterAddress *address.Address `tlb:"addr"`
}

func Code() (*cell.Cell, error) {
	compiledContract, err := wrappers.ParseCompiledContract(WalletContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	return compiledContract, nil
}

func (p *Provider) GetWalletInitCell(ownerAddress *address.Address) (*cell.Cell, error) {
	initData := InitData{
		Status:        0,
		Balance:       tlb.ZeroCoins,
		OwnerAddress:  ownerAddress,
		MasterAddress: p.MinterAddress,
	}
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return nil, fmt.Errorf("failed to convert init data to cell: %w", err)
	}
	return initDataCell, nil
}
