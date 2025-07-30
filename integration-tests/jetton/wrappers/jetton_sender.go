package wrappers

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var JettonSenderContractPath = test_utils.GetBuildDir("examples.jetton.JettonSender.compiled.json")

type JettonSenderProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewJettonSenderProvider(apiClient tracetracking.SignedAPIClient) *JettonSenderProvider {
	return &JettonSenderProvider{
		apiClient: apiClient,
	}
}

type JettonSenderInitData struct {
	MasterAddress    *address.Address `tlb:"addr"`
	JettonWalletCode *cell.Cell       `tlb:"^"`
}

func (p *JettonSenderProvider) Deploy(initData JettonSenderInitData) (*JettonSender, error) {
	initCell, err := tlb.ToCell(initData)
	if err != nil {
		return nil, fmt.Errorf("failed to convert init data to cell: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(JettonSenderContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"))
	if err != nil {
		return nil, err
	}

	return &JettonSender{
		Contract: *contract,
	}, nil
}

type JettonSender struct {
	Contract wrappers.Contract
}

type sendJettonsFastMessage struct {
	_           tlb.Magic        `tlb:"#6984f9bb"` //nolint:revive // This field should stay uninitialized
	QueryID     uint64           `tlb:"## 64"`
	Amount      tlb.Coins        `tlb:"."`
	Destination *address.Address `tlb:"addr"`
}

func (s JettonSender) SendJettonsFast(amount tlb.Coins, destination *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
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

func (s JettonSender) SendJettonsExtended(
	tonAmount tlb.Coins,
	jettonAmount tlb.Coins,
	destination *address.Address,
	customPayload *cell.Cell,
	forwardTonAmount tlb.Coins,
	forwardPayload *cell.Cell,
) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
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
