package jetton

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var SenderContractPath = bindings.GetBuildDir("examples.jetton.JettonSender.compiled.json")

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
	body := cell.BeginCell().EndCell()
	contract, _, err := wrappers.Deploy(&p.apiClient, compiledContract, initCell, tlb.MustFromTON("1"), body)
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

type SendJettonsFastMessage struct {
	_           tlb.Magic        `tlb:"#4C169F42"` //nolint:revive // This field should stay uninitialized
	QueryID     uint64           `tlb:"## 64"`
	Amount      tlb.Coins        `tlb:"."`
	Destination *address.Address `tlb:"addr"`
}

type SendJettonsExtendedMessage struct {
	_                tlb.Magic        `tlb:"#7FDA8110"` //nolint:revive // This field should stay uninitialized
	QueryID          uint64           `tlb:"## 64"`
	Amount           tlb.Coins        `tlb:"."`
	Destination      *address.Address `tlb:"addr"`
	CustomPayload    *cell.Cell       `tlb:"^"`
	ForwardTonAmount tlb.Coins        `tlb:"."`
	ForwardPayload   *cell.Cell       `tlb:"^"`
}
