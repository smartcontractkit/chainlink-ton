package wallet

import (
	"fmt"
	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

// JettonWallet opcodes
const (
	OpcodeAskToTransfer                    = 0x0f8a7ea5
	OpcodeTransferNotificationForRecipient = 0x7362d09c
	OpcodeInternalTransferStep             = 0x178d4519
	OpcodeReturnExcessesBack               = 0xd53276db
	OpcodeAskToBurn                        = 0x595f07bc
	OpcodeBurnNotificationForMinter        = 0x7bdd97de
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
	_                 tlb.Magic        `tlb:"#0f8a7ea5" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID           uint64           `tlb:"## 64"`
	JettonAmount      tlb.Coins        `tlb:"."`
	TransferRecipient *address.Address `tlb:"addr"`
	SendExcessesTo    *address.Address `tlb:"addr"`
	CustomPayload     *cell.Cell       `tlb:"either . ^"`
	ForwardTonAmount  tlb.Coins        `tlb:"."`
	ForwardPayload    *cell.Cell       `tlb:"either . ^"`
}

type AskToBurn struct {
	_              tlb.Magic        `tlb:"#595f07bc" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID        uint64           `tlb:"## 64"`
	JettonAmount   tlb.Coins        `tlb:"."`
	SendExcessesTo *address.Address `tlb:"addr"`
	CustomPayload  *cell.Cell       `tlb:"maybe ^"`
}

type InternalTransferStep struct {
	_                 tlb.Magic        `tlb:"#178d4519" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID           uint64           `tlb:"## 64"`
	JettonAmount      tlb.Coins        `tlb:"."`
	TransferInitiator *address.Address `tlb:"addr"`
	SendExcessesTo    *address.Address `tlb:"addr"`
	ForwardTonAmount  tlb.Coins        `tlb:"."`
	ForwardPayload    *cell.Cell       `tlb:"either . ^"`
}

type TransferNotificationForRecipient struct {
	_                 tlb.Magic        `tlb:"#7362d09c" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID           uint64           `tlb:"## 64"`
	JettonAmount      tlb.Coins        `tlb:"."`
	TransferInitiator *address.Address `tlb:"addr"`
	ForwardPayload    *cell.Cell       `tlb:"maybe ^"`
}

type BurnNotificationForMinter struct {
	_              tlb.Magic        `tlb:"#7bdd97de" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID        uint64           `tlb:"## 64"`
	JettonAmount   tlb.Coins        `tlb:"."`
	BurnInitiator  *address.Address `tlb:"addr"`
	SendExcessesTo *address.Address `tlb:"addr"`
}

type ReturnExcessesBack struct {
	_       tlb.Magic `tlb:"#d53276db" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID uint64    `tlb:"## 64"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	AskToTransfer{},
	AskToBurn{},
	InternalTransferStep{},
	TransferNotificationForRecipient{},
	BurnNotificationForMinter{},
	ReturnExcessesBack{},
	jetton.TopUpTons{},
}).MustWithStorageType(InitData{})

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
