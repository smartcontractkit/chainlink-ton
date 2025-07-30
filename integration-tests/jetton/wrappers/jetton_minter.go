package wrappers

import (
	"context"
	"fmt"
	"math/rand/v2"

	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/jetton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	ErrorInvalidOp      tvm.ExitCode = tvm.ExitCode(72)
	ErrorWrongOp        tvm.ExitCode = tvm.ExitCode(0xffff)
	ErrorNotOwner       tvm.ExitCode = tvm.ExitCode(73)
	ErrorNotValidWallet tvm.ExitCode = tvm.ExitCode(74)
	ErrorWrongWorkchain tvm.ExitCode = tvm.ExitCode(333)
)

var JettonMinterContractPath = path.Join(PathContractsJetton, "JettonMinter.compiled.json")

type JettonMinterProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewJettonMinterProvider(apiClient tracetracking.SignedAPIClient) *JettonMinterProvider {
	return &JettonMinterProvider{
		apiClient: apiClient,
	}
}

type JettonMinterInitData struct {
	TotalSupply   tlb.Coins        `tlb:"."`
	Admin         *address.Address `tlb:"addr"`
	TransferAdmin *address.Address `tlb:"addr"`
	WalletCode    *cell.Cell       `tlb:"^"`
	JettonContent *cell.Cell       `tlb:"^"`
}

func (p *JettonMinterProvider) Deploy(initData JettonMinterInitData) (*JettonMinter, error) {
	compiledContract, err := wrappers.ParseCompiledContract(JettonMinterContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return nil, fmt.Errorf("failed to convert init data to cell: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
	if err != nil {
		return nil, err
	}

	return &JettonMinter{
		Contract:     *contract,
		jettonClient: jetton.NewJettonMasterClient(p.apiClient.Client, contract.Address),
	}, nil
}

func (p *JettonMinterProvider) Open(address *address.Address) (*JettonMinter, error) {
	contract := wrappers.Contract{
		Address: address,
		Client:  &p.apiClient,
	}
	return &JettonMinter{
		Contract:     contract,
		jettonClient: jetton.NewJettonMasterClient(p.apiClient.Client, address),
	}, nil
}

type JettonMinter struct {
	Contract     wrappers.Contract
	jettonClient *jetton.Client
}

// JettonMinter opcodes
const (
	JettonMinterMint              = 0x642b7d07
	JettonMinterBurnNotification  = 0x7bdd97de
	JettonMinterChangeAdmin       = 0x6501f354
	JettonMinterClaimAdmin        = 0xfb88e119
	JettonMinterDropAdmin         = 0x7431f221
	JettonMinterChangeMetadataURL = 0xcb862902
	JettonMinterUpgrade           = 0x2508d66a
	JettonMinterInternalTransfer  = 0x178d4519
	JettonMinterExcesses          = 0xd53276db
)

type jettonInternalTransfer struct {
	_                tlb.Magic        `tlb:"#178d4519"` //nolint:revive // This field should stay uninitialized
	QueryID          uint64           `tlb:"## 64"`
	Amount           tlb.Coins        `tlb:"."`
	From             *address.Address `tlb:"addr"`
	ResponseAddress  *address.Address `tlb:"addr"`
	ForwardTonAmount tlb.Coins        `tlb:"."`
	ForwardPayload   *cell.Cell       `tlb:"either . ^"`
}

type mintMessage struct {
	_           tlb.Magic              `tlb:"#642b7d07"` //nolint:revive // This field should stay uninitialized
	QueryID     uint64                 `tlb:"## 64"`
	Destination *address.Address       `tlb:"addr"`
	TonAmount   tlb.Coins              `tlb:"."`
	MasterMsg   jettonInternalTransfer `tlb:"^"`
}

func (m JettonMinter) SendMint(tonAmount tlb.Coins, destination *address.Address, tonAmountInJettonMessage tlb.Coins, jettonAmount tlb.Coins, from *address.Address, responseAddress *address.Address, forwardTonAmount tlb.Coins, forwardPayload *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(mintMessage{
		QueryID:     queryID,
		Destination: destination,
		TonAmount:   tonAmountInJettonMessage,
		MasterMsg: jettonInternalTransfer{
			QueryID:          queryID,
			Amount:           jettonAmount,
			From:             from,
			ResponseAddress:  responseAddress,
			ForwardTonAmount: forwardTonAmount,
			ForwardPayload:   forwardPayload,
		},
	}, tonAmount)
	return msgReceived, err
}

type changeAdminMessage struct {
	_        tlb.Magic        `tlb:"#6501f354"` //nolint:revive // This field should stay uninitialized
	QueryID  uint64           `tlb:"## 64"`
	NewAdmin *address.Address `tlb:"addr"`
}

func (m JettonMinter) SendChangeAdmin(newAdmin *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(changeAdminMessage{
		QueryID:  queryID,
		NewAdmin: newAdmin,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type claimAdminMessage struct {
	_       tlb.Magic `tlb:"#fb88e119"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

func (m JettonMinter) SendClaimAdmin() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(claimAdminMessage{QueryID: queryID}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type dropAdminMessage struct {
	_       tlb.Magic `tlb:"#7431f221"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

func (m JettonMinter) SendDropAdmin() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(dropAdminMessage{
		QueryID: queryID,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type changeContentMessage struct {
	_       tlb.Magic  `tlb:"#cb862902"` //nolint:revive // This field should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	Content *cell.Cell `tlb:"^"`
}

func (m JettonMinter) SendChangeContent(content *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(changeContentMessage{
		QueryID: queryID,
		Content: content,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type upgradeMessage struct {
	_       tlb.Magic  `tlb:"#2508d66a"` //nolint:revive // This field should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	NewData *cell.Cell `tlb:"^"`
	NewCode *cell.Cell `tlb:"^"`
}

func (m JettonMinter) SendUpgrade(newData *cell.Cell, newCode *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(upgradeMessage{
		QueryID: queryID,
		NewData: newData,
		NewCode: newCode,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

// Getter methods
func (m JettonMinter) GetJettonData() (*jetton.Data, error) {
	return m.jettonClient.GetJettonData(context.TODO())
}
