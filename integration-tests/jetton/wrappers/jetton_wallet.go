package wrappers

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"path"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var JettonWalletContractPath = path.Join(test_utils.GetRepoRootDir(), "result/lib/node_modules/jetton/build/JettonWallet.compiled.json")

type JettonWalletProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewJettonWalletProvider(apiClient tracetracking.SignedAPIClient) *JettonWalletProvider {
	return &JettonWalletProvider{
		apiClient: apiClient,
	}
}

type JettonWalletInitData struct {
	OwnerAddress        *address.Address
	JettonMasterAddress *address.Address
	Balance             uint64
	Status              uint8
}

func (p *JettonWalletProvider) Deploy(initData JettonWalletInitData) (JettonWallet, error) {
	// Deploy the contract
	b := cell.BeginCell()
	err := b.StoreUInt(uint64(initData.Status), 4)
	if err != nil {
		return JettonWallet{}, fmt.Errorf("failed to store Status: %w", err)
	}
	err = b.StoreCoins(initData.Balance)
	if err != nil {
		return JettonWallet{}, fmt.Errorf("failed to store Balance: %w", err)
	}
	err = b.StoreAddr(initData.OwnerAddress)
	if err != nil {
		return JettonWallet{}, fmt.Errorf("failed to store OwnerAddress: %w", err)
	}
	err = b.StoreAddr(initData.JettonMasterAddress)
	if err != nil {
		return JettonWallet{}, fmt.Errorf("failed to store JettonMasterAddress: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(JettonWalletContractPath)
	if err != nil {
		return JettonWallet{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return JettonWallet{}, err
	}

	return JettonWallet{
		Contract: *contract,
	}, nil
}

type JettonWallet struct {
	Contract wrappers.Contract
}

// JettonWallet opcodes
const (
	JettonWalletTransfer             = 0x0f8a7ea5
	JettonWalletTransferNotification = 0x7362d09c
	JettonWalletInternalTransfer     = 0x178d4519
	JettonWalletExcesses             = 0xd53276db
	JettonWalletBurn                 = 0x595f07bc
	JettonWalletBurnNotification     = 0x7bdd97de
	JettonWalletWithdrawTons         = 0x107c49ef
	JettonWalletWithdrawJettons      = 0x10
)

func (m transferMessage) OpCode() uint64 {
	return JettonWalletTransfer
}

func (m transferMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreBigCoins(m.jettonAmount)
	if err != nil {
		return fmt.Errorf("failed to store jettonAmount: %w", err)
	}
	err = b.StoreAddr(m.destination)
	if err != nil {
		return fmt.Errorf("failed to store destination: %w", err)
	}
	err = b.StoreAddr(m.responseDestination)
	if err != nil {
		return fmt.Errorf("failed to store responseDestination: %w", err)
	}

	// Store custom payload
	if m.customPayload != nil {
		err = b.StoreBoolBit(true)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
		err = b.StoreRef(m.customPayload)
		if err != nil {
			return fmt.Errorf("failed to store custom payload: %w", err)
		}
	} else {
		err = b.StoreBoolBit(false)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
	}

	err = b.StoreBigCoins(m.forwardTonAmount)
	if err != nil {
		return fmt.Errorf("failed to store forwardTonAmount: %w", err)
	}

	// Store forward payload
	err = m.forwardPayload.Store(b)
	if err != nil {
		return fmt.Errorf("failed to store forward payload: %w", err)
	}

	return nil
}

func (w JettonWallet) SendTransfer(tonAmount tlb.Coins, jettonAmount *big.Int, destination *address.Address, responseDestination *address.Address, customPayload *cell.Cell, forwardTonAmount *big.Int, forwardPayload ForwardPayload) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = w.Contract.CallWaitRecursively(transferMessage{
		queryID:             queryID,
		jettonAmount:        jettonAmount,
		destination:         destination,
		responseDestination: responseDestination,
		customPayload:       customPayload,
		forwardTonAmount:    forwardTonAmount,
		forwardPayload:      forwardPayload,
	}, tonAmount)
	return msgReceived, err
}

type burnMessage struct {
	queryID             uint64
	jettonAmount        uint64
	responseDestination *address.Address
	customPayload       *cell.Cell
}

func (m burnMessage) OpCode() uint64 {
	return JettonWalletBurn
}

func (m burnMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreCoins(m.jettonAmount)
	if err != nil {
		return fmt.Errorf("failed to store jettonAmount: %w", err)
	}
	err = b.StoreAddr(m.responseDestination)
	if err != nil {
		return fmt.Errorf("failed to store responseDestination: %w", err)
	}

	// Store custom payload
	if m.customPayload != nil {
		err = b.StoreBoolBit(true)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
		err = b.StoreRef(m.customPayload)
		if err != nil {
			return fmt.Errorf("failed to store custom payload: %w", err)
		}
	} else {
		err = b.StoreBoolBit(false)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
	}

	return nil
}

func (w JettonWallet) SendBurn(jettonAmount uint64, responseDestination *address.Address, customPayload *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = w.Contract.CallWaitRecursively(burnMessage{
		queryID:             queryID,
		jettonAmount:        jettonAmount,
		responseDestination: responseDestination,
		customPayload:       customPayload,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type withdrawTonsMessage struct {
	queryID uint64
}

func (m withdrawTonsMessage) OpCode() uint64 {
	return JettonWalletWithdrawTons
}

func (m withdrawTonsMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	return nil
}

func (w JettonWallet) SendWithdrawTons() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = w.Contract.CallWaitRecursively(withdrawTonsMessage{queryID}, tlb.MustFromTON("0.05"))
	return msgReceived, err
}

type withdrawJettonsMessage struct {
	queryID uint64
	from    *address.Address
	amount  uint64
}

func (m withdrawJettonsMessage) OpCode() uint64 {
	return JettonWalletWithdrawJettons
}

func (m withdrawJettonsMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreAddr(m.from)
	if err != nil {
		return fmt.Errorf("failed to store from: %w", err)
	}
	err = b.StoreCoins(m.amount)
	if err != nil {
		return fmt.Errorf("failed to store amount: %w", err)
	}
	return nil
}

func (w JettonWallet) SendWithdrawJettons(from *address.Address, amount uint64) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = w.Contract.CallWaitRecursively(withdrawJettonsMessage{queryID, from, amount}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

// Getter methods
func (w JettonWallet) GetJettonBalance() (uint64, error) {
	return wrappers.Uint64From(w.Contract.Get("get_wallet_data"))
}

func (w JettonWallet) GetWalletStatus() (uint32, error) {
	return wrappers.Uint32From(w.Contract.Get("get_wallet_data"))
}
