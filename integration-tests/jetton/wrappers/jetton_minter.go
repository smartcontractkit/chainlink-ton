package wrappers

import (
	"context"
	"fmt"
	"math/big"
	"math/rand/v2"
	"os"
	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/jetton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var PathContractsJetton = os.Getenv("PATH_CONTRACTS_JETTON")

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
	TotalSupply   *big.Int         `tlb:"var uint 16"`
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

type mintMessage struct {
	queryID     uint64
	destination *address.Address
	tonAmount   *big.Int
	masterMsg   jettonInternalTransfer
}

func (m mintMessage) OpCode() uint64 {
	return JettonMinterMint
}

func (m mintMessage) StoreArgs(b *cell.Builder) error {
	// First, build the internal transfer message
	transferMsg := cell.BeginCell()
	err := transferMsg.StoreUInt(m.masterMsg.OpCode(), 32)
	if err != nil {
		return fmt.Errorf("failed to store opcode in transfer message: %w", err)
	}
	err = m.masterMsg.Store(transferMsg)
	if err != nil {
		return fmt.Errorf("failed to store transfer message args: %w", err)
	}

	// Store the mint message arguments in the passed builder
	err = b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreAddr(m.destination)
	if err != nil {
		return fmt.Errorf("failed to store destination: %w", err)
	}
	err = b.StoreBigCoins(m.tonAmount)
	if err != nil {
		return fmt.Errorf("failed to store tonAmount: %w", err)
	}

	err = b.StoreRef(transferMsg.EndCell())
	if err != nil {
		return fmt.Errorf("failed to store transfer message reference: %w", err)
	}

	return nil
}

func (m JettonMinter) SendMint(tonAmount tlb.Coins, destination *address.Address, tonAmountInJettonMessage *big.Int, jettonAmount *big.Int, from *address.Address, responseAddress *address.Address, forwardPayload ForwardPayload, forwardTonAmount *big.Int) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	if forwardPayload == nil {
		forwardPayload = NewForwardPayload(cell.BeginCell().ToSlice())
	}
	msgReceived, err = m.Contract.CallWaitRecursively(mintMessage{
		queryID:     queryID,
		destination: destination,
		tonAmount:   tonAmountInJettonMessage,
		masterMsg: jettonInternalTransfer{
			queryID:          queryID,
			amount:           jettonAmount,
			from:             from,
			responseAddress:  responseAddress,
			forwardPayload:   forwardPayload,
			forwardTonAmount: forwardTonAmount,
		}}, tonAmount)
	return msgReceived, err
}

type changeAdminMessage struct {
	queryID  uint64
	newAdmin *address.Address
}

func (m changeAdminMessage) OpCode() uint64 {
	return JettonMinterChangeAdmin
}

func (m changeAdminMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreAddr(m.newAdmin)
	if err != nil {
		return fmt.Errorf("failed to store newAdmin: %w", err)
	}
	return nil
}

func (m JettonMinter) SendChangeAdmin(newAdmin *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(changeAdminMessage{queryID, newAdmin}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type claimAdminMessage struct {
	queryID uint64
}

func (m claimAdminMessage) OpCode() uint64 {
	return JettonMinterClaimAdmin
}

func (m claimAdminMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	return nil
}

func (m JettonMinter) SendClaimAdmin() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(claimAdminMessage{queryID}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type dropAdminMessage struct {
	queryID uint64
}

func (m dropAdminMessage) OpCode() uint64 {
	return JettonMinterDropAdmin
}

func (m dropAdminMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	return nil
}

func (m JettonMinter) SendDropAdmin() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(dropAdminMessage{queryID}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type changeContentMessage struct {
	queryID uint64
	content *cell.Cell
}

func (m changeContentMessage) OpCode() uint64 {
	return JettonMinterChangeMetadataURL
}

func (m changeContentMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreRef(m.content)
	if err != nil {
		return fmt.Errorf("failed to store content: %w", err)
	}
	return nil
}

func (m JettonMinter) SendChangeContent(content *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(changeContentMessage{queryID, content}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type upgradeMessage struct {
	queryID uint64
	newData *cell.Cell
	newCode *cell.Cell
}

func (m upgradeMessage) OpCode() uint64 {
	return JettonMinterUpgrade
}

func (m upgradeMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreRef(m.newData)
	if err != nil {
		return fmt.Errorf("failed to store newData: %w", err)
	}
	err = b.StoreRef(m.newCode)
	if err != nil {
		return fmt.Errorf("failed to store newCode: %w", err)
	}
	return nil
}

func (m JettonMinter) SendUpgrade(newData *cell.Cell, newCode *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = m.Contract.CallWaitRecursively(upgradeMessage{queryID, newData, newCode}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

// Getter methods
func (m JettonMinter) GetJettonData() (*jetton.Data, error) {
	return m.jettonClient.GetJettonData(context.TODO())
}
