package jetton

import (
	"fmt"
	"math/rand/v2"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var SenderContractPath = bindings.GetBuildDir("examples.jetton.Sender.compiled.json")

type SenderProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewSenderProvider(apiClient tracetracking.SignedAPIClient) *SenderProvider {
	return &SenderProvider{
		apiClient: apiClient,
	}
}

type SenderInitData struct {
	MasterAddress *address.Address `tlb:"addr"`
	WalletCode    *cell.Cell       `tlb:"^"`
}

func (p *SenderProvider) Deploy(initData SenderInitData) (*Sender, error) {
	initCell, err := tlb.ToCell(initData)
	if err != nil {
		return nil, fmt.Errorf("failed to convert init data to cell: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(SenderContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"), cell.BeginCell().EndCell())
	if err != nil {
		return nil, err
	}

	return &Sender{
		Contract: *contract,
	}, nil
}

type Sender struct {
	Contract wrappers.Contract
}

type sendJettonsFastMessage struct {
	_           tlb.Magic        `tlb:"#6984f9bb"` //nolint:revive // This field should stay uninitialized
	QueryID     uint64           `tlb:"## 64"`
	Amount      tlb.Coins        `tlb:"."`
	Destination *address.Address `tlb:"addr"`
}

func (s Sender) SendJettonsFast(amount tlb.Coins, destination *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(sendJettonsFastMessage{
		QueryID:     queryID,
		Amount:      amount,
		Destination: destination,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type sendJettonsExtendedMessage struct {
	_                tlb.Magic        `tlb:"#e815f1d0"` //nolint:revive // This field should stay uninitialized
	QueryID          uint64           `tlb:"## 64"`
	Amount           tlb.Coins        `tlb:"."`
	Destination      *address.Address `tlb:"addr"`
	CustomPayload    *cell.Cell       `tlb:"^"`
	ForwardTonAmount tlb.Coins        `tlb:"."`
	ForwardPayload   *cell.Cell       `tlb:"^"`
}

func (s Sender) SendJettonsExtended(
	tonAmount tlb.Coins,
	queryID uint64,
	jettonAmount tlb.Coins,
	destination *address.Address,
	customPayload *cell.Cell,
	forwardTonAmount tlb.Coins,
	forwardPayload *cell.Cell,
) (msgReceived *tracetracking.ReceivedMessage, err error) {
	msgReceived, err = s.Contract.CallWaitRecursively(sendJettonsExtendedMessage{
		QueryID:          queryID,
		Amount:           jettonAmount,
		Destination:      destination,
		CustomPayload:    customPayload,
		ForwardTonAmount: forwardTonAmount,
		ForwardPayload:   forwardPayload,
	}, tonAmount)
	return msgReceived, err
}
