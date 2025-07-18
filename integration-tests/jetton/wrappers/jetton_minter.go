package wrappers

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"os"
	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var PATH_CONTRACTS_JETTON = os.Getenv("PATH_CONTRACTS_JETTON")

var JettonMinterContractPath = path.Join(PATH_CONTRACTS_JETTON, "JettonMinter.compiled.json")

type JettonMinterProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewJettonMinterProvider(apiClient tracetracking.SignedAPIClient) *JettonMinterProvider {
	return &JettonMinterProvider{
		apiClient: apiClient,
	}
}

type JettonMinterInitData struct {
	TotalSupply   uint64
	Admin         *address.Address
	TransferAdmin *address.Address
	WalletCode    *cell.Cell
	JettonContent *cell.Cell
}

func (p *JettonMinterProvider) Deploy(initData JettonMinterInitData) (*JettonMinter, error) {
	// Deploy the contract
	b := cell.BeginCell()
	err := b.StoreCoins(initData.TotalSupply)
	if err != nil {
		return nil, fmt.Errorf("failed to store TotalSupply: %w", err)
	}
	err = b.StoreAddr(initData.Admin)
	if err != nil {
		return nil, fmt.Errorf("failed to store Admin: %w", err)
	}

	err = b.StoreAddr(initData.TransferAdmin)
	if err != nil {
		return nil, fmt.Errorf("failed to store TransferAdmin: %w", err)
	}

	err = b.StoreRef(initData.WalletCode)
	if err != nil {
		return nil, fmt.Errorf("failed to store WalletCode: %w", err)
	}
	err = b.StoreRef(initData.JettonContent)
	if err != nil {
		return nil, fmt.Errorf("failed to store JettonContent: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(JettonMinterContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return nil, err
	}

	return &JettonMinter{
		Contract: *contract,
	}, nil
}

type JettonMinter struct {
	Contract wrappers.Contract
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

func (m mintMessage) OpCode() uint64 {
	return JettonMinterMint
}

func (m mintMessage) StoreArgs(b *cell.Builder) error {
	// First, build the internal transfer message
	mintMsg := cell.BeginCell()
	err := mintMsg.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID in internal message: %w", err)
	}
	err = mintMsg.StoreAddr(m.destination)
	if err != nil {
		return fmt.Errorf("failed to store destination in internal message: %w", err)
	}
	err = mintMsg.StoreBigCoins(m.tonAmount)
	if err != nil {
		return fmt.Errorf("failed to store tonAmount: %w", err)
	}

	transferMsg := cell.BeginCell()
	err = m.masterMsg.Store(transferMsg)
	if err != nil {
		return fmt.Errorf("failed to store transfer message args: %w", err)
	}
	err = mintMsg.StoreRef(transferMsg.EndCell())
	if err != nil {
		return fmt.Errorf("failed to store transfer message in mint message: %w", err)
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
			queryId:          queryID,
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
func (m JettonMinter) GetJettonData() (uint64, *address.Address, *address.Address, *cell.Cell, *cell.Cell, error) {
	result, err := m.Contract.Get("get_jetton_data")
	if err != nil {
		return 0, nil, nil, nil, nil, err
	}

	totalSupply, err := result.Int(0)
	if err != nil {
		return 0, nil, nil, nil, nil, err
	}

	_, err = result.Int(1) // mintable flag - not used for now
	if err != nil {
		return 0, nil, nil, nil, nil, err
	}

	admin, err := result.Slice(2)
	if err != nil {
		return 0, nil, nil, nil, nil, err
	}

	jettonContent, err := result.Cell(3)
	if err != nil {
		return 0, nil, nil, nil, nil, err
	}

	walletCode, err := result.Cell(4)
	if err != nil {
		return 0, nil, nil, nil, nil, err
	}

	var adminAddr *address.Address
	if admin.BitsLeft() > 0 {
		adminAddr, err = admin.LoadAddr()
		if err != nil {
			return 0, nil, nil, nil, nil, err
		}
	}

	return totalSupply.Uint64(), adminAddr, nil, jettonContent, walletCode, nil
}
